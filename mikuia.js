var async = require('async')
var cli = require('cli-color')
var fs = require('fs')
var irc = require('irc')
var moment = require('moment')
var osuapi = require('./osuapi')
var redis = require('redis').createClient()
var repl = require('repl')
var request = require('request')
var Twitchy = require('twitchy')
var _ = require('underscore')
_.str = require('underscore.string')
_.mixin(_.str.exports())
_.str.include('Underscore.string', 'string')

var client
var twitch

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
		'1m': [],
		'5m': [],
		'chat': [],
		'enable': []
	}
	this.modules = {
		async: async,
		cli: cli,
		fs: fs,
		irc: irc,
		moment: moment,
		redis: redis,
		request: request,
		twitch: twitch,
		_: _
	}
	this.plugins = {}
	this.settings = {
		plugins: {}
	}
	this.streams = {}

	this.handleMessage = function(from, channel, message) {
		var self = this
		if(message.indexOf('!') == 0) {
			var tokens = message.replace('!', '').split(' ')
			var trigger = tokens[0].toLowerCase()

			if(!_.isUndefined(this.channels[channel].commands[trigger])) {
				var command = this.channels[channel].commands[trigger].command
				if(this.channels[channel].plugins[this.commands[command].plugin] != undefined) {
					this.plugins[this.commands[command].plugin].handleCommand(command, tokens, from, channel)
				}
			}
		} else {
			_.each(self.hooks.chat, function(pluginName) {
				if(self.channels[channel].plugins[pluginName] != undefined) {
					self.plugins[pluginName].handleMessage(from, channel, message)
				}
			})
		}
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

	this.getViewers = getViewers

	this.joinChannel = function(channelName) {
		var self = this
		client.join('#' + channelName, function(nick, message) {
			self.log(self.LogStatus.Success, 'Joined #' + cli.greenBright(channelName) + ' on Twitch IRC.')
		})
	}

	this.leaveChannel = function(channelName, reason) {
		var self = this
		client.part('#' + channelName, function(nick, reason, message) {
			self.log(self.LogStatus.Success, 'Left #' + cli.redBright(channelName) + ' on Twitch IRC.')
		})
	}

	this.refreshViewers = refreshViewers

	this.update = function(channelName) {
		var self = this
		self.channels['#' + channelName] = {
			commands: {},
			display_name: channelName,
			plugins: {}
		}
		redis.smembers('channel:' + channelName + ':plugins', function(err2, plugins) {
			_.each(plugins, function(pluginName) {
				self.channels['#' + channelName].plugins[pluginName] = {}
				redis.get('channel:' + channelName + ':plugin:' + pluginName + ':settings', function(err3, settings) {
					self.channels['#' + channelName].plugins[pluginName].settings = JSON.parse(settings)
					if(self.enabled[pluginName].indexOf('#' + channelName) == -1) {
						self.enabled[pluginName].push('#' + channelName)
						if(self.hooks.enable.indexOf(pluginName) > -1) {
							self.plugins[pluginName].load('#' + channelName)
						}
					}
				})
			})
		})
		redis.smembers('channel:' + channelName + ':commands', function(err2, commands) {
			_.each(commands, function(commandName) {
				redis.get('channel:' + channelName + ':command:' + commandName, function(err3, command) {
					self.channels['#' + channelName].commands[commandName] = JSON.parse(command)
				})
			})
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
				if(_.isUndefined(Mikuia.settings.plugins[plugin.manifest.name])) {
					Mikuia.settings.plugins[plugin.manifest.name] = {}
				}
				if(plugin.manifest.settings != undefined) {
					_.each(plugin.manifest.settings.server, function loadDefaultSetting(defaultValue, key) {
						if(_.isUndefined(Mikuia.settings.plugins[plugin.manifest.name][key])) {
							Mikuia.settings.plugins[plugin.manifest.name][key] = defaultValue
						}
					})
				}
				_.each(plugin.manifest.commands, function loadCommand(data, command) {
					Mikuia.commands[command] = data
					Mikuia.commands[command].plugin = plugin.manifest.name
				})
				_.each(plugin.manifest.hooks, function loadHook(hookName) {
					Mikuia.hooks[hookName].push(plugin.manifest.name)
				})
				Mikuia.enabled[plugin.manifest.name] = []
				plugin.init(Mikuia)
				Mikuia.plugins[plugin.manifest.name] = plugin
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

setInterval(function() {
	Mikuia.runHooks('5m')
	refreshViewers()
}, 300000)

function initTwitch() {
	client = new irc.Client('irc.twitch.tv', Mikuia.settings.plugins.base.name, {
		sasl: true,
		nick: Mikuia.settings.plugins.base.name,
		userName: Mikuia.settings.plugins.base.name,
		password: Mikuia.settings.plugins.base.password
	})

	twitch = new Twitchy({
		key: Mikuia.settings.plugins.base.clientID,
		secret: Mikuia.settings.plugins.base.clientSecret
	})

	twitch.auth(function(err, token) {
		if(!err) {
			console.log('Authed with token ' + token)
		}
	})

	Mikuia.log(Mikuia.LogStatus.Normal, 'Connecting to Twitch IRC...')

	client.on('motd', function(motd) {
		Mikuia.log(Mikuia.LogStatus.Normal, 'Received Twitch IRC MOTD.')
	})

	client.on('registered', function(message) {
		Mikuia.log(Mikuia.LogStatus.Success, 'Connected to Twitch IRC.')
		redis.smembers('channels', function(redisErr, channels) {
			async.each(channels, function loadChannel(channelName, callback) {
				Mikuia.joinChannel(channelName)
				Mikuia.update(channelName)
				callback()
			}, function loadChannelsEnd(err) {
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

	refreshViewers()
}

function getViewers(callback) {
	redis.zrange('viewers', 0, -1, "WITHSCORES", function(err, data) {
		callback(err, data)
	})
}

function refreshViewers() {
	redis.smembers('channels', function(err, channels) {
		async.each(channels, function(channel, callback) {
			twitch._get('streams/' + channel, function(err, stream) {
				if(!err && stream.req.res.body != undefined) {
					if(stream.req.res.body.stream != null) {
						console.log(stream.req.res.body.stream)
						Mikuia.channels['#' + channel].display_name = stream.req.res.body.stream.channel.display_name
						Mikuia.streams['#' + channel] = stream.req.res.body.stream
						redis.zadd('viewers', stream.req.res.body.stream.viewers, channel)
					} else {
						delete Mikuia.streams['#' + channel]
						redis.zrem('viewers', channel)
					}
				}
				callback(err)
			})
		}, function(err) {
			// eh
		})
	})
}

var r = repl.start('Mikuia> ')
r.context.Mikuia = Mikuia
