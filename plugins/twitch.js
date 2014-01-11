var Mikuia
var twitch

exports.manifest = {
	name: 'twitch',
	fullName: 'Twitch.tv',
	type: 'channel',
	description: 'Twitch.tv utilities',
	commands: {
		'twitch.viewers': {
			description: 'Shows the current viewer count.'
		}
	}
}

exports.handleCommand = function(command, tokens, from, channel) {
	switch(command) {
		case 'twitch.viewers':
			twitch._get('streams/' + channel.replace('#', ''), function(err, stream) {
				Mikuia.say(channel, stream.req.res.body.stream.viewers + ' viewers.')
			})
			break
	}
}

exports.init = function(m) {
	Mikuia = m
	twitch = Mikuia.modules.twitch
}