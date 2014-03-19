var jade, Mikuia, token, _

exports.init = function(m) {
	jade = require('jade')
	Mikuia = m
	token = require('rand-token')
	_ = Mikuia.modules._
}

exports.class = function(id, cb) {
	this.id = id
	this.data = {
		channel: '',
		date: '',
		template: '',
		content: {}
	}

	this.getChannelName = function() {
		return this.data.channel
	}

	this.getContent = function() {
		return this.data.content
	}

	this.getData = function() {
		return this.data
	}

	this.getDate = function() {
		return this.data.date
	}

	this.getId = function() {
		return this.id
	}

	this.getTemplate = function() {
		return this.data.template
	}

	this.load = function() {
		var self = this
		Mikuia.modules.redis.get('activity:' + this.getId(), function(err, activityData) {
			if(!err) {
				var data = null
				try {
					data = JSON.parse(activityData)
				} catch(e) {
					Mikuia.log(Mikuia.LogStatus.Error, 'Failed to parse activity ' + self.getId() + '.')
				}
				if(data) {
					self.data = data.data
					if(data.data.channel) {
						console.log(self.getId() + ' - ' + data.data.channel)
						self.update()
					}
				}
			} else {
				Mikuia.log(Mikuia.LogStatus.Error, 'Failed to load activity ' + self.getId() + '.')
			}
		})
	}

	this.render = function() {
		return jade.renderFile('views/mixins/' + this.getTemplate() + '.jade', {
			Activity: this,
			Channel: Mikuia.getChannel(this.getChannelName()),
			content: this.getContent()
		})
	}

	this.save = function() {
		var self = this
		Mikuia.modules.redis.set('activity:' + self.getId(), JSON.stringify({
			data: self.getData()
		}), function(err, reply) {
			if(err) {
				Mikuia.log(Mikuia.LogStatus.Error, 'Failed to save info for activity ' + self.getId() + '.')
			}
		})
		Mikuia.modules.redis.sadd('activities', self.getId(), function(err, reply) {
			if(err) {
				Mikuia.log(Mikuia.LogStatus.Error, 'Failed to add activity ' + self.getId() + ' to the set.')
			}
		})
		if(self.getChannelName() != '') {
			Mikuia.modules.redis.sadd('channel:' + self.getData().channel + ':activities', self.getId(), function(err, reply) {
				if(err) {
					Mikuia.log(Mikuia.LogStatus.Error, 'Failed to add activity ' + self.getId() + ' to the set of ' + self.getChannelName() + '.')
				}
			})
		}
	}

	this.setContent = function(content) {
		this.content = content
		this.save()
	}

	this.setData = function(data) {
		this.data = data
		this.save()
	}

	this.setId = function(id) {
		this.id = id
		this.update()
	}

	this.setTemplate = function(template) {
		this.template = template
	}

	this.update = function() {
		if(Mikuia.getChannel(this.getChannelName()).getActivities().indexOf(this.getId()) == -1) {
			Mikuia.getChannel(this.getChannelName()).addActivity(this)
		}
	}

	if(id != undefined) {
		this.load()
	} else {
		this.setId(token.suid(12))
		this.save()
	}
	
}