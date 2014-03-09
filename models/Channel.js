var Mikuia, _

exports.init = function(m) {
	Mikuia = m
	_ = Mikuia.modules._
}

exports.class = function(channelName) {
	this.commands = {}
	this.info = {
		display_name: channelName
	}
	this.name = channelName
	this.plugins = {}
	this.users = {}

	this.addCommand = function(commandName, command, callback) {
		var self = this
		this.commands[commandName] = {
			command: command,
			settings: {}
		}
		Mikuia.modules.redis.sadd('channel:' + this.getName() + ':commands', commandName, function(err, reply) {
			if(err) {
				Mikuia.log(Mikuia.LogStatus.Error, 'Failed to add command ' + commandName + ' to channel ' + this.getName() + '.')
				callback(true)
			} else {
				Mikuia.modules.redis.set('channel:' + self.getName() + ':command:' + commandName, JSON.stringify({command: command}), function(err2, reply2) {
					if(err2) {
						Mikuia.log(Mikuia.LogStatus.Error, 'Failed to set command ' + commandName + ' for channel ' + self.getName() + '.')
						callback(true)
					} else {
						callback(false)
						self.load()
					}
				})
			}
		})
	}

	this.addIRCUser = function(nick, mode) {
		this.users[nick] = mode
	}

	this.addPlugin = function(pluginName, callback) {
		var self = this
		Mikuia.modules.redis.sadd('channel:' + this.getName() + ':plugins', pluginName, function(err, reply) {
			callback(err, reply)
			self.loadPlugin(pluginName)
		})
	}

	this.disable = function(callback) {
		Mikuia.modules.redis.srem('channels', this.getName(), function(err, reply) {
			callback(err, reply)
		})
		Mikuia.leaveChannel(this.getName(), 'They don\'t want me here anymore ._.')
	}

	this.enable = function(callback) {
		Mikuia.modules.redis.sadd('channels', this.getName(), function(err, reply) {
			callback(err, reply)
		})
		Mikuia.joinChannel(this.getName())
		this.addPlugin('base', function() {})
	}

	this.getCommand = function(commandName) {
		if(commandName in this.commands) {
			return this.commands[commandName]
		} else {
			return false
		}
	}

	this.getCommands = function() {
		return this.commands
	}

	this.getDisplayName = function() {
		var name = this.getInfo('display_name')
		if(name) {
			return name
		} else {
			return this.getName()
		}
	}

	this.getInfo = function(infoName) {
		if(infoName in this.info) {
			return this.info[infoName]
		} else {
			return false
		}
	}

	this.getIRCName = function() {
		return '#' + this.getName()
	}

	this.getIRCUsers = function() {
		return this.users
	}

	this.getIRCUser = function(user) {
		if(user in this.users) {
			return this.users[user]
		} else {
			return false
		}
	}

	this.getName = function() {
		return this.name
	}

	this.getPlugin = function(pluginName) {
		return this.plugins[pluginName]
	}

	this.getPlugins = function() {
		return Object.keys(this.plugins)
	}

	this.getSetting = function(pluginName, settingName) {
		var defaults = Mikuia.plugins[pluginName].manifest.settings.channel
		var settings = this.plugins[pluginName].settings

		if(_.isObject(settings) && !_.isUndefined(settings[settingName]) && !_.isNull(settings[settingName])) {
			return settings[settingName]
		} else if(!_.isUndefined(defaults[settingName]) && !_.isUndefined(defaults[settingName].default)){
			return defaults[settingName].default
		} else {
			return null
		}
	}

	this.getSettings = function(pluginName) {
		return this.plugins[pluginName].settings
	}

	this.getShortStatus = function() {
		if(this.getIRCName() in Mikuia.streams) {
			return 'streaming'
		} else if(this.getName() in Mikuia.viewers) {
			return 'online'
		} else {
			return 'offline'
		}
	}

	this.getStatus = function() {
		if(this.getIRCName() in Mikuia.streams) {
			if(!_.isUndefined(Mikuia.streams[this.getIRCName()].game)) {
				return 'Streaming ' + Mikuia.streams[this.getIRCName()].game
			} else {
				return 'Streaming'
			}
		} else if(this.getName() in Mikuia.viewers) {
			var viewObject = Mikuia.viewers[this.getName()]
			var count = viewObject.length
			if(count > 1) {
				return 'Online on ' + count + ' channels'
			} else if(count == 1) {
				return 'Online on ' + viewObject[0]
			} else {
				return 'WTF IS THIS'
			}
		} else {
			return 'Offline'
		}
	}

	this.getStream = function(callback) {
		Mikuia.modules.twitch._get('streams/' + this.getName(), function(err, stream) {
			if(!err && !_.isUndefined(stream.req.res.body)) {
				callback(false, stream.req.res.body.stream)
			} else {
				callback(true, null)
			}
		})
	}

	this.getViewers = function(callback) {
		this.getStream(function(err, stream) {
			if(!err) {
				if(!_.isNull(stream)) {
					callback(false, stream.viewers)
				} else {
					callback(false, 0)
				}
			} else {
				callback(true, null)
			}
		})
	}

	this.hasPlugin = function(pluginName) {
		return (pluginName in this.plugins)
	}

	this.isEnabled = function(callback) {
		Mikuia.modules.redis.sismember('channels', this.getName(), function(err, reply) {
			callback(err, reply)
		})
	}

	this.isHidden = function() {
		if(this.getInfo('apiKey')) {
			return this.getSetting('base', 'hidden')
		} else {
			return true
		}
	}

	this.load = function() {
		var self = this
		Mikuia.modules.redis.smembers('channel:' + this.getName() + ':plugins', function(err, plugins) {
			if(!err) {
				_.each(plugins, function(pluginName) {
					self.loadPlugin(pluginName)
				})
			} else {
				Mikuia.log(Mikuia.LogStatus.Error, 'Failed to load a list of plugins for channel ' + self.getName())
			}
		})
		Mikuia.modules.redis.smembers('channel:' + this.getName() + ':commands', function(err, commands) {
			if(!err) {
				_.each(commands, function(pluginName) {
					self.loadCommand(pluginName)
				})
			} else {
				Mikuia.log(Mikuia.LogStatus.Error, 'Failed to load a list of commands for channel ' + self.getName())
			}
		})
		Mikuia.modules.redis.get('channel:' + this.getName() + ':info', function(err, info) {
			if(!err) {
				try {
					var data = JSON.parse(info)
				} catch(e) {
					Mikuia.log(Mikuia.LogStatus.Error, 'Failed to parse JSON info for channel ' + self.getName())
				}
				if(_.isObject(data)) {
					self.info = data
				}
			} else {
				Mikuia.log(Mikuia.LogStatus.Error, 'Failed to load info for channel ' + self.getName())
			}
		})
	}

	this.loadCommand = function(commandName) {
		var self = this
		Mikuia.modules.redis.get('channel:' + this.getName() + ':command:' + commandName, function(err, command) {
			if(!err) {
				try {
					self.commands[commandName] = JSON.parse(command)
				} catch(e) {
					Mikuia.log(Mikuia.LogStatus.Error, 'Failed to parse command ' + commandName + ' for channel ' + self.getName() + '.')
				}
				Mikuia.modules.redis.get('channel:' + self.getName() + ':command:' + commandName + ':settings', function(err2, settings) {
					if(!err2) {
						if(settings != null) {
							try {
								self.commands[commandName].settings = JSON.parse(settings)
							} catch(e) {
								Mikuia.log(Mikuia.LogStatus.Error, 'Failed to parse settings for command ' + commandName + ' for channel ' + self.getName() + '.')
							}
						}						
					} else {
						Mikuia.log(Mikuia.LogStatus.Error, 'Failed to load settings for command ' + commandName + ' for channel ' + self.getName() + '.')
					}
				})
			} else {
				Mikuia.log(Mikuia.LogStatus.Error, 'Failed to load command ' + commandName + ' for channel ' + self.getName() + '.')
			}
		})
	}

	this.loadPlugin = function(pluginName) {
		this.plugins[pluginName] = {}

		var self = this
		Mikuia.modules.redis.get('channel:' + this.getName() + ':plugin:' + pluginName + ':settings', function(err, settings) {
			if(!err) {
				try {
					self.plugins[pluginName].settings = JSON.parse(settings)
				} catch(e) {
					Mikuia.log(self.LogStatus.Error, 'Failed to parse settings for plugin ' + pluginName + ' for channel ' + self.getName() + '.')
				}
				if(Mikuia.enabled[pluginName].indexOf(self.getName()) == -1) {
					Mikuia.enabled[pluginName].push(self.getName())
					if(Mikuia.hooks.enable.indexOf(pluginName) > -1) {
						Mikuia.plugins[pluginName].load(self)
					}
				}
			} else {
				Mikuia.log(Mikuia.LogStatus.Error, 'Failed to load settings for plugin ' + pluginName + ' for channel ' + self.getName() + '.')
			}
		})
	}

	this.removeCommand = function(commandName, callback) {
		var self = this
		delete this.commands[commandName]
		Mikuia.modules.redis.srem('channel:' + this.getName() + ':commands', commandName, function(err, reply) {
			if(err) {
				Mikuia.log(Mikuia.LogStatus.Error, 'Failed to remove command member ' + commandName + ' from channel ' + this.getName() + '.')
				callback(true)
			} else {
				Mikuia.modules.redis.del('channel:' + self.getName() + ':command:' + commandName, function(err2, reply2) {
					if(err2) {
						Mikuia.log(Mikuia.LogStatus.Error, 'Failed to delete command ' + commandName + ' for channel ' + self.getName() + '.')
						callback(true)
					} else {
						callback(false)
						self.load()
					}
				})
			}
		})
	}

	this.removeIRCUser = function(nick) {
		delete this.users[nick]
	}

	this.removePlugin = function(pluginName, callback) {
		var self = this
		delete this.plugins[pluginName]
		Mikuia.modules.redis.srem('channel:' + this.getName() + ':plugins', pluginName, function(err, reply) {
			callback(err, reply)
			var index = Mikuia.enabled[pluginName].indexOf(self.getName())
			Mikuia.enabled[pluginName].splice(index, 1)
		})
	}

	this.setCommandSettings = function(commandName, settings, callback) {
		var self = this
		this.commands[commandName].settings = settings
		Mikuia.modules.redis.set('channel:' + this.getName() + ':command:' + commandName + ':settings', JSON.stringify(settings), function(err, reply) {
			if(err) {
				Mikuia.log(Mikuia.LogStatus.Error, 'Failed to save command ' + commandName + ' for channel ' + self.getName() + '.')
			}
			callback(err, reply)
		})
	}

	this.setDisplayName = function(displayName) {
		this.setInfo('display_name', displayName)
	}

	this.setInfo = function(infoName, info) {
		this.info[infoName] = info
		var self = this
		Mikuia.modules.redis.set('channel:' + this.getName() + ':info', JSON.stringify(this.info), function(err, reply) {
			if(err) {
				Mikuia.log(Mikuia.LogStatus.Error, 'Failed to save info for channel ' + self.getName() + '.')
			}
		})
	}

	this.setIRCUsers = function(users) {
		this.users = users
	}

	this.setPluginSettings = function(pluginName, settings, callback) {
		this.plugins[pluginName].settings = settings
		Mikuia.modules.redis.set('channel:' + this.getName() + ':plugin:' + pluginName + ':settings', JSON.stringify(settings), function(err, reply) {
			callback(err, reply)
		})
	}

	this.load()
}