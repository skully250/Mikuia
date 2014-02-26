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
				if(from == Mikuia.settings.plugins.base.admin.toLowerCase()) {
					var action = tokens[1]

					

					switch(action) {
						case 'run':
							var command = tokens[2]
							var newTokens = tokens.splice(2, 2)

							Mikuia.plugins[Mikuia.commands[command].plugin].handleCommand(command, newTokens, from, Channel)
							break
						default:
							Mikuia.say(Channel.getIRCName(), 'Wrong action: ' + action)
					}
				} else {
					Mikuia.say(Channel.getIRCName(), 'You...you\'re not su-supposed to do that... baka...')
				}
			} else {
				Mikuia.say(Channel.getIRCName(), 'Hey, I\'m Mikuia, and I\'m a bot made by Maxorq / Hatsuney! Learn more about me at http://mikuia.tv/')
			}
			break
		case 'mikuia.channels':
			if(from == Mikuia.settings.plugins.base.admin.toLowerCase()) {
				var channelList = ""
				_.each(Mikuia.channels, function(channel, channelName) {
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