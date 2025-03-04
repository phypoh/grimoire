const rp = require("request-promise-native");
const _ = require("lodash");
const Discord = require("discord.js");
const utils = require("../utils");
const log = utils.getLogger('role');
const cheerio = require("cheerio");

class BotcRoleLoader {
  constructor(commandChar) {
    this.cc = commandChar;
    this.commands = {
      role: {
        aliases: ['char'],
        inline: true,
        description: "Search for an official Blood on the Clocktower role by name",
        help: '',
        examples: ["role washerwoman", "char spy"]
      },
    };
    this.wikiUrl = "http://wiki.bloodontheclocktower.com/";
    this.wikiApi = this.wikiUrl + "api.php?action=query&prop=categories|revisions&rvprop=content&format=json&rvslots=*&titles=";
    this.wikiImage = this.wikiUrl + 'Special:FilePath/';
    this.wikiSearch = this.wikiUrl + 'api.php?action=query&list=search&srwhat=title&format=json&srsearch=';
    // embed border colors depending on category
    this.colors = {
      "Category:Demons": 0xEC0804,
      "Category:Fabled": 0xECCB21,
      "Category:Minions": 0x9F0400,
      "Category:Outsiders": 0x183EFF,
      "Category:Townsfolk": 0x2096FF,
      "Category:Travellers": 0xc519ff,
    };
  }

  getCommands() {
    return this.commands;
  }

  // generate the embed
  generateEmbed(page, command) {
    // generate embed title and description text
    const title = page.title;
    let team = 'No team';
    let edition = 'No edition'
    let color;
    page.categories.forEach(({title}) => {
      if (!!this.colors[title]) {
        team = title.replace(/Category:/, '');
        color = this.colors[title];
      } else {
        edition = title.replace(/Category:/, '');
      }
    });

    const $ = cheerio.load(page.revisions[0].slots.main['*']);
    const content = $('.columns').text().replace(/==.*?==/ig, '###').replace(/[\n\t]/g, '').split('###')
    
    
    let description = '**' + edition + ' / ' + team + '**\n';
    // description += '"' + content[1].substr(1, content[1].length - 2).split('"')[1] + '"';
    description += '```' + content[1].substr(1, content[1].length - 2).split('"')[0] + '```';

    const image = $('.columns').text().match(/\[\[File:(.*?)\|/)[1];

    // footer
    let footer = "Use " + this.cc + "help to get a list of available commands.";

    // instantiate embed object
    return new Discord.MessageEmbed({
      title,
      description,
      footer: {text: footer},
      url: this.wikiUrl + encodeURIComponent(title),
      color,
      thumbnail: image ? {url: this.wikiImage + encodeURIComponent(image)} : null
    });
  }

  /**
   * Fetch the role from the BOTC wiki
   * @param role
   * @returns {Promise<Object>}
   */
  async getRole(role) {
    const search = await rp({url: this.wikiSearch + encodeURIComponent('*' + role + '*'), json: true});
    

    // debugging
    // log.info(this.wikiSearch + encodeURIComponent('*' + role + '*'));

    if (search.query && search.query.search.length) {
      const {title, pageid} = search.query.search.filter(({snippet, wordcount}) =>
        !snippet.match(/#redirect/i) && wordcount > 100).shift();
      const body = await rp({url: this.wikiApi + encodeURIComponent(title), json: true});

    // debugging
    // log.info(this.wikiApi + encodeURIComponent(title));

      if (body.query && body.query.pages[pageid]) {
        const page = body.query.pages[pageid];
        if (page.categories && page.categories.some(({title}) => !!this.colors[title])) {
          log.info(page);
          return page;
        }
      }
    }
    throw new Error('not found');
  }

  /**
   * Handle an incoming message
   * @param command
   * @param parameter
   * @param msg
   * @returns {Promise}
   */
  handleMessage(command, parameter, msg) {
    const role = parameter.toLowerCase();
    // no role name, no lookup
    if (!role) return;
    // fetch data from API
    this.getRole(role).then(page => {
      // generate embed
      const embed = this.generateEmbed(page, command)
      return msg.channel.send('', {embed});
    }).catch(err => {
      console.error(err);
      let description = 'No roles matched `' + role + '`.';
      if (err.statusCode === 503) {
        description = 'Wiki is currently offline, please try again later.'
      }
      return msg.channel.send('', {
        embed: new Discord.MessageEmbed({
          title: 'Error',
          description,
          color: 0xff0000
        })
      });
    });
  }
}

module.exports = BotcRoleLoader;
