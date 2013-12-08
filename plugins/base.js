var Mikuia
var _

exports.commands = ['plugins']

exports.handleCommand = function(tokens, from, channel) {
	switch(tokens[0]) {
		case 'plugins':
			_.each(Mikuia.plugins, function(plugin, pluginName) {
				// wat
			})
	}
}

exports.init = function(m) {
	Mikuia = m
	_ = Mikuia.modules._
}

exports.name = 'base'

exports.settings = {
	name: 'TWITCH_NAME_HERE',
	password: 'OAUTH_HASH_HERE'
}