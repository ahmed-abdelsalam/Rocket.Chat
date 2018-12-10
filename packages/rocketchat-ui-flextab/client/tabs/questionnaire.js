import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { Session } from 'meteor/session';
import { Template } from 'meteor/templating';
import { Mongo } from 'meteor/mongo';
import _ from 'underscore';
import s from 'underscore.string';
import moment from 'moment';
import { DateFormat, RocketChat } from 'meteor/rocketchat:lib';
import { RoomRoles, popover, UserRoles } from 'meteor/rocketchat:ui';
import { Tracker } from 'meteor/tracker';

const more = function() {
	return Template.instance().actions.get()
		.map((action) => (typeof action === 'function' ? action.call(this) : action))
		.filter((action) => action && (!action.condition || action.condition.call(this)))
		.slice(2);
};

const Questionnaire = new Mongo.Collection('questionnaire', { connection: null });
Questionnaire.remove({});
Template.questionnaire.helpers({
	isGroupChat() {
		const room = ChatRoom.findOne(this.rid, { reactive: false });
		return RocketChat.roomTypes.roomTypes[room.t].isGroupChat();
	},
	userInfoDetail() {

		const room = ChatRoom.findOne(this.rid, { fields: { t: 1 } });

		return {
			tabBar: Template.currentData().tabBar,
			username: Template.instance().userDetail.get(),
			clear: Template.instance().clearUserDetail,
			showAll: RocketChat.roomTypes.roomTypes[room.t].userDetailShowAll(room) || false,
			hideAdminControls: RocketChat.roomTypes.roomTypes[room.t].userDetailShowAdmin(room) || false,
			video: ['d'].includes(room != null ? room.t : undefined),
		};
	},
	hideHeader() {
		return ['Template.adminUserInfo', 'adminUserInfo'].includes(Template.parentData(2).viewName);
	},
	moreActions: more,

	actions() {
		return Template.instance().actions.get()
			.map((action) => (typeof action === 'function' ? action.call(this) : action))
			.filter((action) => action && (!action.condition || action.condition.call(this)))
			.slice(0, 2);
	},
	customField() {
		const sCustomFieldsToShow = RocketChat.settings.get('Accounts_CustomFieldsToShowInUserInfo').trim();
		const customFields = [];

		if (sCustomFieldsToShow) {
			const user = Template.instance().user.get();
			const userCustomFields = (user && user.customFields) || {};
			const listOfCustomFieldsToShow = JSON.parse(sCustomFieldsToShow);

			_.map(listOfCustomFieldsToShow, (el) => {
				let content = '';
				if (_.isObject(el)) {
					_.map(el, (key, label) => {
						const value = RocketChat.templateVarHandler(key, userCustomFields);
						if (value) {
							content = { label, value };
						}
					});
				} else {
					content = RocketChat.templateVarHandler(el, userCustomFields);
				}
				if (content) {
					customFields.push(content);
				}
			});
		}
		return customFields;
	},

	name() {
		// const user = Template.instance().user.get();
		// return user && user.name ? user.name : TAPi18n.__('Unnamed');
		return String(Template.instance().userDetail.get());
	},

	checkUser() {
		return String(Template.instance().userDetail.get()) == 'test' ? 1 : null;
	},
	checkAnswers() {
		const answers = Questionnaire.findOne({});
		if (answers) {
			return answers;
		}
		return null;
	},
	username() {
		const user = Template.instance().user.get();
		return user && user.username;
	},

	userStatus() {
		const user = Template.instance().user.get();
		const userStatus = Session.get(`user_${ user.username }_status`);
		return userStatus;
	},

	email() {
		const user = Template.instance().user.get();
		return user && user.emails && user.emails[0] && user.emails[0].address;
	},

	utc() {
		const user = Template.instance().user.get();
		if (user && user.utcOffset != null) {
			if (user.utcOffset > 0) {
				return `+${ user.utcOffset }`;
			}
			return user.utcOffset;
		}
	},

	lastLogin() {
		const user = Template.instance().user.get();
		if (user && user.lastLogin) {
			return moment(user.lastLogin).format('LLL');
		}
	},

	createdAt() {
		const user = Template.instance().user.get();
		if (user && user.createdAt) {
			return moment(user.createdAt).format('LLL');
		}
	},
	linkedinUsername() {
		const user = Template.instance().user.get();
		if (user && user.services && user.services.linkedin && user.services.linkedin.publicProfileUrl) {
			return s.strRight(user.services.linkedin.publicProfileUrl), '/in/';
		}
	},

	servicesMeteor() {
		const user = Template.instance().user.get();
		return user && user.services && user.services['meteor-developer'];
	},

	userTime() {
		const user = Template.instance().user.get();
		if (user && user.utcOffset != null) {
			return DateFormat.formatTime(Template.instance().now.get().utcOffset(user.utcOffset));
		}
	},

	user() {
		return Template.instance().user.get();
	},

	hasEmails() {
		return _.isArray(this.emails);
	},

	hasPhone() {
		return _.isArray(this.phone);
	},

	isLoading() {
		return Template.instance().loadingUserInfo.get();
	},

	editingUser() {
		return Template.instance().editingUser.get();
	},

	userToEdit() {
		const instance = Template.instance();
		const data = Template.currentData();
		return {
			user: instance.user.get(),
			back(username) {
				instance.editingUser.set();

				if (username != null) {
					const user = instance.user.get();
					if ((user != null ? user.username : undefined) !== username) {
						data.username = username;
						return instance.loadedUsername.set(username);
					}
				}
			},
		};
	},

	roleTags() {
		const user = Template.instance().user.get();
		if (!user || !user._id) {
			return;
		}
		const userRoles = UserRoles.findOne(user._id) || {};
		const roomRoles = RoomRoles.findOne({ 'u._id': user._id, rid: Session.get('openedRoom') }) || {};
		const roles = _.union(userRoles.roles || [], roomRoles.roles || []);
		return roles.length && RocketChat.models.Roles.find({ _id: { $in: roles }, description: { $exists: 1 } }, { fields: { description: 1 } });
	},

	shouldDisplayReason() {
		const user = Template.instance().user.get();
		return RocketChat.settings.get('Accounts_ManuallyApproveNewUsers') && user.active === false && user.reason;
	},
});

Template.questionnaire.events({
	'click .remove-questionnaire'() {
		Questionnaire.remove({});
	},
	'submit .questionnaire-form'(event) {
		const answer1 = event.target.q1.value;
		const answer2 = event.target.q2.value;
		const answer3 = event.target.q3.value;
		const answer4 = event.target.q4.value;
		Questionnaire.remove({});
		Questionnaire.insert({
			answer1,
			answer2,
			answer3,
			answer4,
		});
		return false;
	},
	'click .js-more'(e, instance) {
		const actions = more.call(this);
		const groups = [];
		const columns = [];
		const admin = actions.filter((actions) => actions.group === 'admin');
		const others = actions.filter((action) => !action.group);
		const channel = actions.filter((actions) => actions.group === 'channel');
		if (others.length) {
			groups.push({ items:others });
		}
		if (channel.length) {
			groups.push({ items:channel });
		}

		if (admin.length) {
			groups.push({ items:admin });
		}
		columns[0] = { groups };

		$(e.currentTarget).blur();
		e.preventDefault();
		const config = {
			columns,
			data: {
				rid: this._id,
				username: instance.data.username,
				instance,
			},
			currentTarget: e.currentTarget,
			offsetVertical: e.currentTarget.clientHeight + 10,
		};
		popover.open(config);
	},
	'click .js-action'(e) {
		return this.action && this.action.apply(this, [e, { instance : Template.instance() }]);
	},
	'click .js-close-info'(instance) {
		return instance.clear();
	},
	'click .js-back'(instance) {
		return instance.clear();
	},
});

Template.questionnaire.onCreated(function() {
	this.showAllUsers = new ReactiveVar(false);
	this.usersLimit = new ReactiveVar(100);
	this.userDetail = new ReactiveVar;
	this.showDetail = new ReactiveVar(false);
	this.filter = new ReactiveVar('');


	this.users = new ReactiveVar([]);
	this.total = new ReactiveVar;
	this.loading = new ReactiveVar(true);

	this.tabBar = Template.instance().tabBar;

	Tracker.autorun(() => {
		if (this.data.rid == null) { return; }
		this.loading.set(true);
		return Meteor.call('getUsersOfRoom', this.data.rid, this.showAllUsers.get(), (error, users) => {
			this.users.set(users.records);
			this.total.set(users.total);
			return this.loading.set(false);
		}
		);
	}
	);

	this.clearUserDetail = () => {
		this.showDetail.set(false);
		return setTimeout(() => this.clearRoomUserDetail(), 500);
	};

	this.showUserDetail = (username) => {
		this.showDetail.set(username != null);
		return this.userDetail.set(username);
	};

	this.clearRoomUserDetail = this.data.clearUserDetail;

	return this.autorun(() => {
		const data = Template.currentData();
		return this.showUserDetail(data.userDetail);
	}
	);
});
