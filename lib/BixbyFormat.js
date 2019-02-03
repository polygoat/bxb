const _ = require('lodash');
const BixbyIO = require('../BixbyIO');
const Utils = require('../lib/utils');

const _firstItem = obj => Object.values(obj)[0];
const _firstKey  = obj => Object.keys(obj)[0];

module.exports = {

	findParentEntriesOf(structure, name) {
		const path = this.findPath(structure, name);
		const entriesPath = this.findParentEntriesPath(path);
		return _.get(structure, entriesPath);
	},

	findPath(structure, key, prepath="") {
		let path = false;
		_.each(structure, (value, innerKey) => {
			path = (prepath ? prepath + '.' : '') + innerKey;
			if(innerKey === key) {
				return false;
			} else if(_.isObject(value)) {
				path = this.findPath(value, key, path);
				return false;
			}
		});
		return path;
	},

	findParentEntriesPath(path) {
		let parts = path.split('.entries.');
		let parent = parts[parts.length - 1].split('.').slice(-2)[0];

		if('0123456789'.indexOf(parent) !== -1) {
			if(parts.length === 2) {
				return parts[0] + '.entries';
			}
			return parts.slice(0,-1).join('.entries.');
		}

		parts[parts.length - 1] = parts[parts.length - 1].split('.').slice(0,-1).join('.');
		return parts.join('.entries.');
	},

	dialogs: {
		IDs:   {},
		
		paths: {
				nlgFile: 	'dialog/nlg-strings.dialog.bxb',
				logicFile:  'dialog/macro-logic.dialog.bxb',
				uiFile: 	'dialog/ui-strings.dialog.bxb'
		},

		load(filePath) {
			if(filePath) {
				const dialogs = BixbyIO.read(filePath);
				const parsedIDs = _.get(BixbyIO, 'read.parsers.dialog.data.NLG_IDs', {});
				_.extend(this.IDs, parsedIDs);
				return dialogs;
			}
			return [];
		},

		createResponse(display, speech) {
			display = display.escapeString();
			speech = speech.escapeString() || display;
			return { template: { parameters: display, speech }};
		},

		createResponseSet(nlgID) {
			return {
				"template-macro-def": { 
					content: {
						choose: {
							entries: 	[],
							parameters: 'Random'
						}
					},
					parameters: nlgID
				}
			}
		},

		findResponseSet(nlgID, dialogs) {
			return _.find(dialogs, { 'template-macro-def': { 'parameters': [nlgID] } });
		}
	},

	endpoints: {
		addAction(actionName, parsedEndpoints) {
			const newAction = this.createAction(actionName);
			const endpoints = _.find(parsedEndpoints[0].endpoints.entries, 'action-endpoints');

			if('entries' in endpoints['action-endpoints']) {
				endpoints['action-endpoints'].entries.push(newAction);
			} else {
				endpoints['action-endpoints'] = { entries: [endpoints['action-endpoints'], newAction] };
			}

			return parsedEndpoints;
		},
		createAction(actionName) {
			return {
				"action-endpoint": {
                    "local-endpoint": `${actionName}.js`,
                    "parameters": actionName
                }
			}
		}
	},

	vocabs: {

	},
	
	models: {
	
	},

	trainings: {
	
	},

}