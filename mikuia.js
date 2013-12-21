var async = require('async')
var cli = require('cli-color')
var fs = require('fs')
var irc = require('irc')
var moment = require('moment')
var osuapi = require('./osuapi')
var redis = require('redis').createClient()
var repl = require('repl')
var request = require('request')
var _ = require('underscore')
_.str = require('underscore.string')
_.mixin(_.str.exports())
_.str.include('Underscore.string', 'string')

var client

var Mikuia = new function() {
	
	this.LogStatus = {
		Success: 'SUCCESS',
		Normal: 'INFO',
		Warning: 'WARN',
		Error: 'ERROR',
		Fatal: 'FATAL'
	}

	this.channels = {}
	this.commands = {}
	this.enabled = {}
	this.hooks = {
		'1m': []
	}
	this.modules = {
		async: async,
		cli: cli,
		fs: fs,
		irc: irc,
		moment: moment,
		request: request,
		_: _
	}
	this.patterns = {}
	this.plugins = {}
	this.settings = {
		plugins: {}
	}

	this.handleMessage = function(from, channel, message) {
		var self = this
		if(message.indexOf('!') == 0) {
			var tokens = message.replace('!', '').split(' ')
			var trigger = tokens[0].toLowerCase()

			if(!_.isUndefined(this.commands[trigger])) {
				this.plugins[this.commands[trigger]].handleCommand(tokens, from, channel)
			}
		}
		_.each(this.patterns, function(patternInfo, patternName) {
			if(patternInfo.pattern.test(message)) {
				self.plugins[patternInfo.plugin].handlePattern(patternName, from, channel, message)
			}
		})
	}

	this.log = function(status, message) {
		switch(status) {
			case this.LogStatus.Success:
				color = cli.greenBright
				break
			case this.LogStatus.Normal:
				color = cli.whiteBright
				break
			case this.LogStatus.Warning:
				color = cli.yellowBright
				break
			case this.LogStatus.Error:
				color = cli.redBright
				break
			case this.LogStatus.Fatal:
				color = cli.red
				break
			default:
				color = cli.white
				break
		}
		console.log(moment().format('HH:mm:ss') + ' [' + color(status) + '] ' + message)
	}

	this.say = function(target, message) {
		client.say(target, message)
	}

	this.runHooks = function(hookName) {
		var self = this
		async.each(this.hooks[hookName], function runHook(pluginName, callback) {
			self.plugins[pluginName].runHook(hookName)
		}, function hookRunEnd(err) {
			if(err) {
				throw err
			}
		})
	}

}

Mikuia.log(Mikuia.LogStatus.Normal, 'Starting up Mikuia...')

fs.readFile('settings.json', {encoding: 'utf8'}, function(err, data) {
	if(err) {
		Mikuia.log(Mikuia.LogStatus.Warning, 'Settings file doesn\'t exist, will create a default one.')
	} else {
		Mikuia.settings = JSON.parse(data)
	}
	fs.readdir('plugins', function(err, files) {
		if(err) {
			Mikuia.log(Mikuia.LogStatus.Fatal, 'Can\'t access "plugins" directory.')
		} else {
			Mikuia.log(Mikuia.LogStatus.Normal, 'Found ' + cli.greenBright(files.length) + ' entries.')
		}
		async.each(files, function loadPlugin(fileName, callback) {
			if(fileName.indexOf('.js') > 0) {
				Mikuia.log(Mikuia.LogStatus.Normal, 'Loading plugin: ' + cli.yellowBright(fileName) + '.')
				var plugin = require('./plugins/' + fileName.replace('.js', ''))
				if(_.isUndefined(Mikuia.settings.plugins[plugin.name])) {
					Mikuia.settings.plugins[plugin.name] = {}
				}
				_.each(plugin.settings, function loadDefaultSetting(defaultValue, key) {
					if(_.isUndefined(Mikuia.settings.plugins[plugin.name][key])) {
						Mikuia.settings.plugins[plugin.name][key] = defaultValue
					}
				})
				_.each(plugin.commands, function loadCommand(command) {
					Mikuia.commands[command] = plugin.name
				})
				_.each(plugin.hooks, function loadHook(hookName) {
					Mikuia.hooks[hookName].push(plugin.name)
				})
				_.each(plugin.patterns, function loadPattern(pattern, patternName) {
					Mikuia.patterns[patternName] = {plugin: plugin.name, pattern: pattern}
				})
				Mikuia.enabled[plugin.name] = []
				plugin.init(Mikuia)
				Mikuia.plugins[plugin.name] = plugin
			}
			callback()

		}, function loadPluginEnd(err) {
			if(err) {
				throw err
			}
			initTwitch()
			fs.writeFileSync('settings.json', JSON.stringify(Mikuia.settings, null, '\t'))
		})
	})
})

setInterval(function() {
	Mikuia.runHooks('1m')
}, 60000)

function initTwitch() {
	client = new irc.Client('irc.twitch.tv', Mikuia.settings.plugins.base.name, {
		sasl: true,
		nick: Mikuia.settings.plugins.base.name,
		userName: Mikuia.settings.plugins.base.name,
		password: Mikuia.settings.plugins.base.password
	})

	Mikuia.log(Mikuia.LogStatus.Normal, 'Connecting to Twitch IRC...')

	client.on('motd', function(motd) {
		Mikuia.log(Mikuia.LogStatus.Normal, 'Received Twitch IRC MOTD.')
	})

	client.on('registered', function(message) {
		Mikuia.log(Mikuia.LogStatus.Success, 'Connected to Twitch IRC.')
		fs.readdir('channels', function(err, files) {
			if(err) {
				Mikuia.log(Mikuia.LogStatus.Fatal, 'Can\'t access "channels" directory.')
			} else {
				Mikuia.log(Mikuia.LogStatus.Normal, 'Found ' + cli.greenBright(files.length) + ' channels.')
			}
			async.each(files, function readChannelInfo(fileName, callback) {
				fs.readFile('channels/' + fileName, {encoding: 'utf8'}, function(err, data) {
					if(err) {
						Mikuia.log(Mikuia.LogStatus.Error, 'There was an error reading ' + fileName + ' (' + err + ')')
					} else {
						data = JSON.parse(data)
						if(!_.isEmpty(data.twitch)) {
							Mikuia.channels['#' + data.twitch.toLowerCase()] = data
							_.each(data.plugins, function(value, key) {
								Mikuia.enabled[key].push('#' + data.twitch.toLowerCase())
							})
							client.join('#' + data.twitch.toLowerCase(), function(nick, message) {
								Mikuia.log(Mikuia.LogStatus.Success, 'Joined #' + cli.greenBright(data.twitch) + ' on Twitch IRC.')
								_.each(data.plugins, function(value, key) {
									Mikuia.plugins[key].load('#' + data.twitch.toLowerCase())
								})
							})
						}
					}
					callback(err)
				})

			}, function readChannelDirEnd(err) {
				if(err) {
					throw err
				}
			})
		})
	})

	client.on('message#', function(nick, to, text, message) {
		Mikuia.handleMessage(nick, to, text)
		Mikuia.log(Mikuia.LogStatus.Normal, '(' + cli.greenBright(to) + ') ' + cli.yellowBright(nick) + ': ' + cli.whiteBright(text))
	})
}

var r = repl.start('Mikuia> ')
r.context.Mikuia = Mikuia
