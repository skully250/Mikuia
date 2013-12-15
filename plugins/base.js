var Mikuia
var _

exports.commands = ['mikuia']

exports.handleCommand = function(tokens, from, channel) {
	switch(tokens[0]) {
		case 'mikuia':
			if(from == Mikuia.settings.plugins.base.admin.toLowerCase()) {
				switch(tokens[1]) {
					case 'channels':
						var channelList = ""
						_.each(Mikuia.channels, function(channel, channelName) {
							if(channelList != "") {
								channelList += ', '
							}
							channelList += channelName
						})
						Mikuia.say(channel, 'Enabled channels: ' + channelList)
						break
					case 'donate':
						Mikuia.say(channel, 'Aww, you want to donate? Thank you! http://bit.ly/1clkjef')
						break
					case 'plugins':
						var pluginList = ""
						_.each(Mikuia.plugins, function(plugin, pluginName) {
							if(pluginList != "") {
								pluginList += ', '
							}
							pluginList += pluginName
						})
						Mikuia.say(channel, 'Loaded plugins: ' + pluginList)
						break
					default:
						Mikuia.say(channel, 'Hey, I\'m Mikuia, and I\'m a bot! Learn more about me at http://statpoint.info:5587/')
						break
				}
			}
			break
	}
}

exports.init = function(m) {
	Mikuia = m
	_ = Mikuia.modules._
}

exports.name = 'base'

exports.settings = {
	admin: 'ADMIN_NAME_HERE',
	name: 'TWITCH_NAME_HERE',
	password: 'OAUTH_HASH_HERE',
	clientID: 'API_CLIENT_ID',
	clientSecret: 'API_CLIENT_SECRET',
	callbackURL: 'http://localhost:5587/auth/twitch/callback'
}