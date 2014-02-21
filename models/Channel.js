var Mikuia, _

exports.init = function(m) {
	Mikuia = m
	_ = Mikuia.modules._
}

exports.class = function(channelName) {
	this.commands = {}
	this.name = channelName
	this.plugins = {}

	this.addCommand = function(commandName, command, callback) {
		var self = this
		Mikuia.modules.redis.sadd('channel:' + this.getName() + ':commands', commandName, function(err, reply) {
			if(err) {
				Mikuia.log(Mikuia.LogStatus.Error, 'Failed to add command ' + commandName + ' to channel ' + this.getName() + '.')
			}
			Mikuia.modules.redis.set('channel:' + self.getName() + ':command:' + commandName, JSON.stringify({command: command}), function(err2, reply2) {
				if(err2) {
					Mikuia.log(Mikuia.LogStatus.Error, 'Failed to set command ' + commandName + ' for channel ' + self.getName() + '.')
				}
				callback(false, commandName, command)
				self.load()
			})
		})
	}

	this.getName = function() {
		return this.name
	}

	this.getSetting = function(pluginName, settingName) {
		var defaults = Mikuia.plugins[pluginName].manifest.settings.channel
		var settings = this.plugins[pluginName].settings

		if(!_.isUndefined(settings) && !_.isUndefined(settings[settingName])) {
			return settings[settingName]
		} else if(!_.isUndefined(defaults[settingName]) && !_.isUndefined(defaults[settingName].default)){
			return defaults[settingName].default
		} else {
			return null
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
						try {
							self.commands[commandName].settings = JSON.parse(settings)
						} catch(e) {
							Mikuia.log(Mikuia.LogStatus.Error, 'Failed to parse settings for command ' + commandName + ' for channel ' + self.getName() + '.')
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
						//Mikuia.plugins[pluginName].load(this.getName())
					}
				}
			} else {
				Mikuia.log(Mikuia.LogStatus.Error, 'Failed to load settings for plugin ' + pluginName + ' for channel ' + self.getName() + '.')
			}
		})
	}

	this.removeCommand = function(commandName, callback) {
		var self = this
		Mikuia.modules.redis.srem('channel:' + this.getName() + ':commands', commandName, function(err, reply) {
			if(err) {
				Mikuia.log(Mikuia.LogStatus.Error, 'Failed to remove command member ' + commandName + ' from channel ' + this.getName() + '.')
			}
			Mikuia.modules.redis.del('channel:' + self.getName() + ':command:' + commandName, function(err2, reply2) {
				if(err2) {
					Mikuia.log(Mikuia.LogStatus.Error, 'Failed to delete command ' + commandName + ' for channel ' + self.getName() + '.')
				}
				callback(false, commandName)
				self.load()
			})
		})
	}

	this.save = function() {

	}

	this.saveCommand = function(commandName, settings, callback) {
		var self = this
		Mikuia.modules.redis.set('channel:' + this.getName() + ':command:' + commandName + ':settings', JSON.stringify(settings), function(err, reply) {
			if(err) {
				Mikuia.log(Mikuia.LogStatus.Error, 'Failed to save command ' + commandName + ' for channel ' + self.getName() + '.')
			}
			callback(false, commandName, reply)
		})
	}

	this.load()
}