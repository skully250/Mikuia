var Mikuia
var _

exports.manifest = {
	name: 'base',
	fullName: 'Base',
	description: 'Provides basic commands.',
	type: 'channel',
	commands: {
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
			name: 'TWITCH_NAME_HERE',
			password: 'OAUTH_HASH_HERE',
			clientID: 'API_CLIENT_ID',
			clientSecret: 'API_CLIENT_SECRET',
			callbackURL: 'http://localhost:5587/auth/twitch/callback'
		}
	}
}

exports.handleCommand = function(command, tokens, from, channel) {
	switch(command) {
		case 'mikuia.about':
			Mikuia.say(channel, 'Hey, I\'m Mikuia, and I\'m a bot! Learn more about me at http://statpoint.info:5587/')
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
				Mikuia.say(channel, 'Enabled channels: ' + channelList)
			}
			break
		case 'mikuia.donate':
			Mikuia.say(channel, 'Aww, you want to donate? Thank you! http://bit.ly/1clkjef')
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
				Mikuia.say(channel, 'Loaded plugins: ' + pluginList)
			}
			break
	}
}

exports.init = function(m) {
	Mikuia = m
	_ = Mikuia.modules._
}