const _ = require('lodash');
const inquirer = require('inquirer');
const BixbyIO = require('./BixbyIO');
const BixbyFormat = require('./lib/BixbyFormat');
const Libs = require('./lib/libs.json');
const ActionTypes = require('./lib/actionTypes.json');
const Concepts = require('./lib/concepts.json');
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

let __createLabelsFrom = (entities, labelCallback) => {
	let suggestions = [];
	_.each(entities, (entity, key) => {
		const label = labelCallback(entity, key);
		data[label] = entity;
		entity.label = label;
		suggestions.push(label);
	});
	return suggestions;
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

	actionInput:
	{
		message: 		'Name an[other] input for your action!',
		loop: 			true
	},
	actionName:
	{
		message: 		'Name of the action?'
	},
	actionType:
	{
		message: 		'Pick an action type',
		pageSize: 		8,
		source: 		function(answersSoFar, input) {
							let suggestions = __createLabelsFrom(ActionTypes['transactional'], (type, name) => `${_.padEnd(name, 30)}(transactional)    \t${_.get(type, 'description', '')}`);

							suggestions = suggestions.concat(
								__createLabelsFrom(ActionTypes['non-transactional'], (type, name) => `${_.padEnd(name, 30)}(non-transactional)\t${_.get(type, 'description', '')}`)
							);

							return __createSuggestions(input, suggestions);
						},
		filter: 		label => data[label] || {}, 
	},

	appName: 
	{
		message: 		'Name of the app',
		default: 		'AppName'
	},
	appNamespace: {
		message: 		'Namespace (e.g. your company name)',
		default: 		'bixby'
	},

	concept:
	{
		message: 		'Select a concept to add',
		source: 		function(answersSoFar, input) {
							let suggestions = __createLabelsFrom(Concepts, concept => concept.lib ? `${_.padEnd(concept.name, 30)}  (${concept.lib})` : concept.name);
							//console.log('got any suggestions?', suggestions);
							suggestions.unshift('New (custom)');
							return __createSuggestions(input, suggestions);
						},
		filter: 		label => data[label] || {},
		pageSize: 		30
	},
	conceptName:
	{
		message: 		'Name of the concept?',
		default: 		'MyConcept'
	},
	conceptType:
	{
		message: 		'Which datatype do you need?',
		source: 		(answersSoFar, input) => {
							console.log('taf', answersSoFar);
							let suggestions = ['name','integer','enum','boolean','structure','decimal','text'];
							return __createSuggestions(input, suggestions);
						},
		pageSize: 		30
	},

	description: 
	{
		message: 		'Please provide a brief description!',
		optional: 		true
	},

	library:
	{
		message: 		'Choose a library!',
		source: 		function(answersSoFar, input) {
							let suggestions = Object.keys(Libs);
							_.each(Libs, (lib, alias) => lib.alias = alias); 
							return __createSuggestions(input, suggestions);
						},
		filter: 		value => __createAsync(() => Libs[value])
	},

	newNlgID: {
		message: 		'Name for the new dialog ID?'
	},
	nlgID: 	
	{
		message: 		'Select the according responset set:',
		suggestOnly: 	true,
		source: 		(answersSoFar, input) => {
							const dialogs = BixbyFormat.dialogs.load(self.getPath('nlgFile'));
							let suggestions = Object.keys(_.get(BixbyIO, 'read.parsers.dialog.data.NLG_IDs', {}));
							return __createSuggestions(input, suggestions);
						},
		validate: function(val) {
	        return val ? true : 'No response set found!';
	    },
	},

	output:
	{
		message: 		'Name the output of your action!'
	},

	responseDisplay:		
	{
		message: 		'What response do you want to be shown on the screen?'
	},
	responseSpoken:		
	{
		message: 		'What response do you want to be spoken out?'
	},
	responseNr:
	{
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
	},
	utterance:
	{
		loop: 	true,
		message:'What [other ]utterance do you want your app to support?'
	},
	vocabName:
	{
		message: 		'Name of the vocab?'
	}
}