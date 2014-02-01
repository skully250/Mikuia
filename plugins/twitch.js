var Mikuia

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

exports.omg = function() {
	console.log(Mikuia.modules.twitch)
}

exports.handleCommand = function(command, tokens, from, channel) {
	switch(command) {
		case 'twitch.viewers':
			Mikuia.modules.twitch._get('streams/' + channel.replace('#', ''), function(err, stream) {
				if(err) {
					Mikuia.log(Mikuia.LogStatus.Error, 'Failed to get viewer count for ' + channel.replace('#', '') + '.')
				}
				if(stream.req.res.body.stream != undefined) {
					Mikuia.say(channel, stream.req.res.body.stream.viewers + ' viewers.')
				}
			})
			break
	}
}

exports.init = function(m) {
	Mikuia = m
}