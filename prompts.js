const _ = require('lodash');
const BixbyIO = require('./BixbyIO');
const BixbyFormat = require('./lib/BixbyFormat');
const Libs = require('./lib/libs.json');
const ActionTypes = require('./lib/actionTypes.json');
const fuzzy = require('fuzzy');

let self = false;
let data = {};
let __suggestions = [];

let __createAsync = (...args) => {
	let first, then;

	if(args.length === 2) {
		first = args[0];
		then = args[1];
	} else {
		first = false;
		then = args[0];
	}

	return new Promise(resolve => setTimeout(() => {
		first && first();
		return resolve(then());
	}, 1));
}

let __createSuggestions = (input, suggestions) => {
	input = input || '';
	return new Promise(resolve => setTimeout(() => {
		suggestions = fuzzy.filter(input, suggestions);
		return resolve(suggestions.map(el => el.original));
	}, 1));
}

module.exports = {
	parent: false,
	
	init: function(__self) {
		self = __self;
		this.parent = __self;
	},
	setData: function(name, value) {
		data[name] = value;
	},

	appName: 
	{
		type: 	'input',
		message: 'Name of the app',
		default: 'AppName'
	},

	description: 
	{
		type: 	 'input',
		message: 'Please provide a brief description!'
	},

	utterance:
	{
		type: 	'input',
		loop: 	true,
		message:'What [other ]utterance do you want your app to support?'
	},

	nlgID: 	
	{
		type: 			'autocomplete',
		message: 		'Select the according responset set:',
		suggestOnly: 	true,
		source: 		(answersSoFar, input) => {
							const dialogs = BixbyFormat.dialogs.load(self.getPath('nlgFile'));
							let suggestions = Object.keys(BixbyIO.read.parsers.dialog.data.NLG_IDs);
							return __createSuggestions(input, suggestions);
						},
		validate: function(val) {
	        return val ? true : 'No response set found!';
	    },
	},

	vocabName:
	{
		type: 			'input',
		message: 		'Name of the vocab?'
	},
	actionName:
	{
		type: 			'input',
		message: 		'Name of the action?'
	},
	actionType:
	{
		type: 			'autocomplete',
		message: 		'Pick an action type',
		pageSize: 		8,
		source: 		function(answersSoFar, input) {
							let suggestions = [];
							_.each(ActionTypes['non-transactional'], (type, name) => {
								suggestions.push(`${_.padEnd(name, 30)}(non-transactional)\t${_.get(type, 'description', '')}`);
							});
							_.each(ActionTypes.transactional, (type, name) => {
								suggestions.push(`${_.padEnd(name, 30)}(transactional)    \t${_.get(type, 'description', '')}`);
							});
							return __createSuggestions(input, suggestions);
						}
	},

	library:
	{
		type: 			'autocomplete',
		message: 		'Choose a library!',
		source: 		function(answersSoFar, input) {
							let suggestions = Object.keys(Libs);
							return __createSuggestions(input, suggestions);
						},
		filter: 		value => __createAsync(() => _.extend({ alias: value }, Libs[value]))
	},

	newNlgID: {
		type: 			'input',
		message: 		'Name for the new dialog ID?'
	},
	responseDisplay:		
	{
		type: 			'input',
		message: 		'What response do you want to be shown on the screen?'
	},
	responseSpoken:		
	{
		type: 			'input',
		message: 		'What response do you want to be spoken out?'
	},
	responseNr:
	{
		type: 			'autocomplete',
		message: 		'Select the response:',
		source: 		function(answersSoFar, input) {
							const dialogs = BixbyFormat.dialogs.load(self.getPath('nlgFile'));
							const macro   = BixbyFormat.dialogs.findResponseSet(data.nlgID, dialogs);
							let entries = BixbyFormat.findParentEntriesOf(macro, 'template');

							let suggestions = [];

							if('template' in entries) {
								entries = [entries];
							}

							_.each(entries, (entry, key) => {
								suggestions.push(_.get(entry.template, 'parameters.0', entry.template));
							});

							__suggestions = suggestions;

							return __createSuggestions(input, suggestions);
						},
		filter: 		value => __createAsync(() => __suggestions.indexOf(value)+1)
	}
}