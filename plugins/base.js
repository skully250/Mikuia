var exec = require('child_process').exec
var Mikuia
var _

exports.manifest = {
	name: 'base',
	fullName: 'Base',
	description: 'Provides basic commands.',
	type: 'channel',
	commands: {
		'dummy': {
			description: 'Static text.',
			settings: {
				'text': {
					description: 'Text to use.',
					name: 'Text',
					type: 'text'
				}
			}
		},
		'mikuia.about': {
			description: 'Shows some info about Mikuia.'
		},
		'mikuia.channels': {
			description: 'Shows the list of enabled channels. Spammy.'
		},
		'mikuia.donate': {
			description: 'Shows a Mikuia donate link.'
		},
		'mikuia.plugins': {
			description: 'Shows a list of enabled plugins. Also spammy.'
		}
	},
	settings: {
		channel: {
			hidden: {
				default: false,
				description: 'Hide your status from other users.',
				type: 'radio'
			}
		},
		server: {
			admin: 'ADMIN_NAME_HERE',
			redisPassword: 'YES_PASSWORD_HEREEE',
			name: 'TWITCH_NAME_HERE',
			password: 'OAUTH_HASH_HERE',
			clientID: 'API_CLIENT_ID',
			clientSecret: 'API_CLIENT_SECRET',
			callbackURL: 'http://localhost:5587/auth/twitch/callback',
			rollbarToken: 'ROLLBAR_SERVER_SIDE_TOKEN_HERE'
		}
	}
}

exports.handleCommand = function(command, tokens, from, Channel) {
	switch(command) {
		case 'dummy':
			var command = Channel.getCommand(tokens[0])
			if(command != undefined && command.settings != null) {
				Mikuia.say(Channel.getIRCName(), command.settings.text)
			}
			break
		case 'mikuia':
		case 'mikuia.about':
			console.log(tokens)
			if(tokens.length > 1) {

				var action = tokens[1]
				var isAdmin = false
				var isModerator = false

				if(from == Mikuia.settings.plugins.base.admin.toLowerCase()) {
					isAdmin = true
					isModerator = true
				}

				if(from == Channel.getName()) {
					isModerator = true
				}

				if(Channel.getIRCUser(from) == '+') {
					isModerator = true
				}

				switch(action) {
					case 'brazil':
						Mikuia.say(Channel.getIRCName(), 'HUEHUEHUEHUEHUE')
						break
					case 'cake':
						Mikuia.say(Channel.getIRCName(), 'But... but it\'s a lie ;_;')
						break
					case 'commands':
						if(isAdmin) {
							var commandList = ""
							_.each(Channel.getCommands(), function(command, commandName, list) {
								if(commandList != "") {
									commandList += ', '
								}
								commandList += commandName
							})
							Mikuia.say(Channel.getIRCName(), 'Commands: ' + commandList)
						} else {
							Mikuia.say(Channel.getIRCName(), 'Hell no.')
						}
						break
					case 'dummy':
						console.log('isModerator: ' + isModerator)
						if(isModerator) {
							console.log('tokens.length: ' + tokens.length)
							if(tokens.length > 3) {
								var commandName = tokens[2]
								console.log('commandName: ' + tokens[2])
								var text = tokens.splice(3, tokens.length - 3).join(' ')
								console.log('text: ' + text)
								Channel.addCommand(commandName, 'dummy', function(err) {
									console.log('err: ' + err)
									if(!err) {
										console.log('!err')
										Channel.setCommandSettings(commandName, {
											text: text
										}, function(err2, reply) {
											console.log('yes')
											console.log('err2: ' + err2 + ' reply: ' + reply)
											if(err2) {
												Mikuia.say(Channel.getIRCName(), 'Failed to set the text... I\'m good for nothing D:')
											} else {
												Mikuia.say(Channel.getIRCName(), 'I think it worked...')
											}
										})
									} else {
										console.log('err')
										Mikuia.say(Channel.getIRCName(), 'Failed to add command \'' + commandName + '\'... sorry.')
									}
								})
							} else {
								Mikuia.say(Channel.getIRCName(), 'Um... you kind of forgot something... Just saying...')
							}
						} else {
							Mikuia.say(Channel.getIRCName(), 'Go away, dummy.')
						}
						break
					case 'mods':
						var userList = ""
						_.each(Channel.getIRCUsers(), function(userObject, userName, list) {
							if(userObject == '+') {
								if(userList != "") {
									userList += ', '
								}
								userList += userObject
								userList += userName
							}
						})
						Mikuia.say(Channel.getIRCName(), 'Moderators online: ' + userList)
						break
					case 'names':
						if(isAdmin) {
							var userList = ""
							_.each(Channel.getIRCUsers(), function(userObject, userName, list) {
								if(userList != "") {
									userList += ', '
								}
								userList += userObject
								userList += userName
							})
							Mikuia.say(Channel.getIRCName(), 'User list according to Twitch: ' + userList)
						} else {
							Mikuia.say(Channel.getIRCName(), 'Why would I let you do that?')
						}
						break
					case 'remove':
						if(isModerator) {
							if(tokens.length > 2) {
								var name = tokens[2]
								Channel.removeCommand(name, function(err) {
									if(err) {
										Mikuia.say(Channel.getIRCName(), 'Errr, it didn\'t work :(')
									} else {
										Mikuia.say(Channel.getIRCName(), 'It shall be removed!')
									}
								})
							} else {
								Mikuia.say(Channel.getIRCName(), 'You forgot something, baka!')
							}
						} else {
							Mikuia.say(Channel.getIRCName(), 'Chill out there, I won\'t let you do that!')
						}
						break
					case 'run':
						if(isAdmin) {
							var command = tokens[2]
							var newTokens = tokens.splice(2, 2)

							Mikuia.plugins[Mikuia.commands[command].plugin].handleCommand(command, newTokens, from, Channel)
						} else {
							Mikuia.say(Channel.getIRCName(), 'No. Just no.')
						}
						break
					case 'settings':
						if(isAdmin) {
							if(tokens.length > 2) {
								var pluginName = tokens[2]
								Mikuia.say(Channel.getIRCName(), JSON.stringify(Channel.getSettings(pluginName)))
							} else {
								Mikuia.say(Channel.getIRCName(), 'Missing parameter.')
							}
						} else {
							Mikuia.say(Channel.getIRCName(), 'Please stop.')
						}						
						break
					case 'status':
						if(tokens.length > 2) {
							var channel = Mikuia.getChannel(tokens[2])
							if(!channel.isHidden()) {
								var name = channel.getName()
								if(!_.isUndefined(Mikuia.viewers[name])) {
									var count = Mikuia.viewers[name].length
									var channelList = ""
									_.each(Mikuia.viewers[name].slice(0).splice(0, 5), function(channelName) {
										if(channelList != "") {
											channelList += ', '
										}
										channelList += channelName
									})
									if(count > 5) {
										Mikuia.say(Channel.getIRCName(), name + ' is currently on ' + count + ' channels: ' + channelList + ', and ' + (count - 5) + ' more...')
									} else if(count > 1) {
										Mikuia.say(Channel.getIRCName(), name + ' is currently on ' + count + ' channels: ' + channelList)
									} else if(count == 1) {
										Mikuia.say(Channel.getIRCName(), name + ' is currently only on ' + channelList)
									}
								}
							}
						} else {
							Mikuia.say(Channel.getIRCName(), 'Status of... who?')
						}						
						break
					case 'test':
						if(isAdmin) {
							Mikuia.say(Channel.getIRCName(), 'You\'re an admin, ' + from + '.')
						} else if(from == Channel.getName()) {
							Mikuia.say(Channel.getIRCName(), 'You\'re a broadcaster, ' + from + '.')
						} else if(isModerator) {
							Mikuia.say(Channel.getIRCName(), 'You\'re a moderator, ' + from + '.')
						} else {
							Mikuia.say(Channel.getIRCName(), 'You\'re a regular user, ' + from + '.')
						}
						break
					case 'version':
						var child = exec('git rev-list HEAD --count', function(err, stdout, sderr) {
							if(!err) {
								Mikuia.say(Channel.getIRCName(), 'Mikuia (build ' + stdout.replace('\n', '') + ')')
							}
						})
						break
					default:
						Mikuia.say(Channel.getIRCName(), 'Hey... sorry, but that command doesn\'t even exist...')
						break
				}
			} else {
				Mikuia.say(Channel.getIRCName(), 'Hey, I\'m Mikuia, and I\'m a bot made by Maxorq / Hatsuney! Learn more about me at http://mikuia.tv/')
			}
			break
		case 'mikuia.channels':
			if(from == Mikuia.settings.plugins.base.admin.toLowerCase()) {
				var channelList = ""
				_.each(Object.keys(Mikuia.channels2), function(channelName) {
					if(channelList != "") {
						channelList += ', '
					}
					channelList += channelName
				})
				Mikuia.say(Channel.getIRCName(), 'Enabled channels: ' + channelList)
			}
			break
		case 'mikuia.donate':
			Mikuia.say(Channel.getIRCName(), 'Aww, you want to donate? Thank you! http://bit.ly/1clkjef')
			break
		case 'mikuia.plugins':
			if(from == Mikuia.settings.plugins.base.admin.toLowerCase()) {
				var pluginList = ""
				_.each(Mikuia.plugins, function(plugin, pluginName) {
					if(pluginList != "") {
						pluginList += ', '
					}
					pluginList += pluginName
				})
				Mikuia.say(Channel.getIRCName(), 'Loaded plugins: ' + pluginList)
			}
			break
	}
}

exports.init = function(m) {
	Mikuia = m
	_ = Mikuia.modules._
}