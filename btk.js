#!/usr/bin/env node
// compile using npm run pkg

const inquirer = require('inquirer');
const fs = require('fs');
const _ = require('lodash');
const glob = require('glob');
const path = require('path');
const exec = require('child_process').exec;

const TemplateBuilder = require('./TemplateBuilder');
const BixbyIO = require('./BixbyIO');
const BixbyFormat = require('./lib/BixbyFormat');
const Utils = require('./lib/utils');

const Prompts = require('./prompts');
const Libs = require('./lib/Libs')

const throwError = message => console.log(`\x1b[31m${message}\x1b[0m`);
const throwWarning = message => console.log(` \x1b[33m\u26A0 ${message}\x1b[0m`);

__BTK_VERSION = '0.0.1';

const globals = { 
	homePath: 		process.cwd(),
	user: 			require("os").userInfo(),
	get_namespace: 	() => [_.get(BixbyToolkit.data, 'app.namespace', 'undefined'), _.get(BixbyToolkit.data, 'app.name', 'unnamed')].join('.'), 
	the_field: 		(name, defaultValue, description) => {
						const active = _.get(BixbyToolkit.data, name);
						let question = _.find(BixbyToolkit.questions, {name});

						const promptKey = name.replace(/(\.[a-z])/g, val => val.slice(1).toUpperCase());

						if(promptKey in Prompts) {
							question = Prompts[promptKey];
							question.type = 'source' in question ? 'autocomplete' : 'input';
							question.name = promptKey;
						}


						if(!active) {
							_.set(BixbyToolkit.data, name, defaultValue);
							if(question) {
								question.active = true;
							}
						}

						if(!question) {
							BixbyToolkit.questions.push({
								name,
								active:  !active,
								type: 	 'input',
								message: description,
								default: active || defaultValue 
							});
						}

						return active || defaultValue || '[unset]';
					}
};

inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));

class BixbyToolkit {
	
	constructor(options) {
		this.sourcePath = null;
		this.targetPath = null;

		this.verbose = false;
		this.silent = false;

		this.isCapsule = false;

		_.extend(this, options);

		const capsuleFilePath = path.join(this.targetPath, 'capsule.bxb');

		if(fs.existsSync(capsuleFilePath)) {
			this.isCapsule = true;

			if(!fs.existsSync(BixbyToolkit.configPath)) {
				
				let capsuleInfo = BixbyIO.read(capsuleFilePath)[0].capsule.entries;
				capsuleInfo = _.extend.apply(_, capsuleInfo);

				const name = path.basename(this.targetPath);
				const namespace = capsuleInfo.id.split('.').slice(0,-1).join('.');
				const version = capsuleInfo.version;

				const target = capsuleInfo.targets.entries[0].target.replace('bixby-', '').split('-');
				const targetDevice = target[0];
				const language = target.slice(1).join('-');

				globals.app = { name, namespace, version, language, targetDevice };
				BixbyToolkit.isProjectDirectory = true;

				this.saveConfig();
			} else {
				const configs = JSON.parse(fs.readFileSync(BixbyToolkit.configPath, 'utf8'));

				globals.timestamp = +new Date();
				BixbyToolkit.lastChange = globals.timestamp - configs.timestamp;
				BixbyToolkit.isProjectDirectory = true;

				_.defaultsDeep(BixbyToolkit.data, configs);
				
			}
		}

		_.defaultsDeep(BixbyToolkit.data, globals);


		this.CLI = {
			config: 			(name, value) => {
									if(!this.__isInsideCapsuleFolder()) return;
									const question = _.find(BixbyToolkit.questions, { name });
									
									if(value) {
										question.value = value;
										_.set(BixbyToolkit.data, name, value);
										this.saveConfig();
									} else if(name) {
										if(question)
											console.log(question.value);
										else 
											throwError(`Error! Configuration "${name}" doesn't exist.`);
									} else {
										this.__reaskQuestions();
									}
								},
			'capsule create': 	(appName, location) => {
									const userInput = this.__askForMissingParameters(this.CLI['capsule create'], { appName });
									if(userInput.isNecessary) return;

									_.set(BixbyToolkit.data, 'app.name', appName);
									
									if(location) {
										this.sourcePath = location;
									}

									this.targetPath = path.resolve(path.join(this.targetPath, '/' + appName));
									BixbyToolkit.configPath = path.resolve(path.join(this.targetPath, '/.btk-project'));

									this.__copyModule('capsule', 'base', false, () => {
										BTK.saveConfig();
									});
								},
			'utterance add': 	(utterance) => {
									if(!this.__isInsideCapsuleFolder()) return;
									const userInput = this.__askForMissingParameters(this.CLI['utterance add'], { utterance });
									if(userInput.isNecessary) return;
									
									if(!_.isEmpty(utterance)) {
										const hints = BixbyIO.read(this.getPath('resources', `${BixbyToolkit.data.app.name}.hints.bxb`));
										
										console.log('H', hints[0].hints);

										BixbyIO.addEntry({ utterance }, hints[0].hints, 'hint-set');

										console.log('new hints', JSON.stringify(hints, null, 4));

										BixbyIO.save(hints);
									}
								},
			'responseset add': 	(newNlgID, ...options) => {
									if(!this.__isInsideCapsuleFolder()) return;
									const userInput = this.__askForMissingParameters(this.CLI['responseset add'], { newNlgID });
									if(userInput.isNecessary) return;
									
									const dialogs = BixbyFormat.dialogs.load(this.getPath('nlgFile'));

									if(newNlgID in BixbyIO.read.parsers.dialog.data.NLG_IDs) {
										throwError(`${nlgID} already exists!`);
									} else {
										dialogs.push(BixbyFormat.dialogs.createResponseSet(newNlgID));										
										BixbyIO.write(this.getPath('nlgFile'), dialogs);
									}
								},
			'response add': 	(nlgID, responseDisplay, responseSpoken) => {
									if(!this.__isInsideCapsuleFolder()) return;
									const userInput = this.__askForMissingParameters(this.CLI['response add'], { nlgID, responseDisplay, responseSpoken });
									if(userInput.isNecessary) return;

									const dialogs = BixbyFormat.dialogs.load(this.getPath('nlgFile'));

									if(!nlgID in BixbyIO.read.parsers.dialog.data.NLG_IDs) {
										dialogs.push(BixbyFormat.dialogs.createResponseSet(nlgID))
									}

									const macro =  BixbyFormat.dialogs.findResponseSet(nlgID, dialogs);
									const entries = BixbyFormat.findParentOf(macro['template-macro-def'], 'template');
									const template = BixbyFormat.dialogs.createResponse(responseDisplay, responseSpoken);

									BixbyIO.addEntry(template, entries);
									BixbyIO.write(this.getPath('nlgFile'), dialogs);
									console.log(" Response added!");
								},
			'response remove': 	(nlgID, responseNr) => {
									if(!this.__isInsideCapsuleFolder()) return;
									const userInput = this.__askForMissingParameters(this.CLI['response remove'], { nlgID, responseNr });
									if(userInput.isNecessary) return;

									const dialogs = BixbyFormat.dialogs.load(this.getPath('nlgFile'));
									const macro   = BixbyFormat.dialogs.findResponseSet(nlgID, dialogs);
									let   parent  = BixbyFormat.findParentEntriesOf(macro, 'template');

									if('entries' in parent) {
										BixbyIO.removeEntry(responseNr, parent);
									} else if('template' in parent) {
										delete parent.template;
									}

									BixbyIO.write(this.getPath('nlgFile'), dialogs);
									console.log(`\n Response #${responseNr} removed.`);
								},
			'vocab add': 		(vocabName, description) => {
									if(!this.__isInsideCapsuleFolder()) return;
									const userInput = this.__askForMissingParameters(this.CLI['vocab add'], { vocabName, description });
									if(userInput.isNecessary) return;

									BixbyToolkit.data.currentVocabDescription = description;
									BixbyToolkit.data.currentVocabName = vocabName;

									const vocabPath  = this.getPath('resources', 'vocab');
									const modelsPath = this.getPath('models', 	 'primitive/');

									this.__copyModule('vocab', 'base', vocabPath, () =>
										this.__copyModule('models', 'base', modelsPath, () => console.log(''))
									);
								},
			'action add': 		(actionName, actionType, actionInput, output, description) => {
									if(!this.__isInsideCapsuleFolder()) return;
									const userInput = this.__askForMissingParameters(this.CLI['action add'], { actionName, actionType, actionInput, output, description });
									if(userInput.isNecessary) return;

									BixbyToolkit.data.actionName = actionName;
									BixbyToolkit.data.description = description;
									BixbyToolkit.data.type = actionType;
									BixbyToolkit.data.outputConcept = output;

									const hasNewEndpoints = TemplateBuilder.copyFileIfDoesntExist(`${this.sourcePath}/endpoints.bxb.dot`, 				  this.getPath('resources'), 	BixbyToolkit.data);
									TemplateBuilder.copyFileIfDoesntExist(`${this.sourcePath}/code/{{_self.actionName}}.js.dot`, 						  this.getPath('code'), 		BixbyToolkit.data);

									BixbyToolkit.data.conceptName = output;
									BixbyToolkit.data.conceptType = 'text';
									TemplateBuilder.copyFileIfDoesntExist(`${this.sourcePath}/models/base/primitive/{{_self.conceptName}}.model.bxb.dot`, this.getPath('models'), 		BixbyToolkit.data);

									if(!hasNewEndpoints) {
										const endpointsPath = `${this.getPath('resources')}/endpoints.bxb`;
										let endpoints = BixbyIO.read(endpointsPath);

										endpoints = BixbyFormat.endpoints.addAction(actionName, endpoints);
										BixbyIO.save(endpoints);
									}

									console.log(` Action "${actionName}" created.`);
									TemplateBuilder.printFileList(this.targetPath);
								},
			'concept add': 		(concept, conceptType) => {
									if(!this.__isInsideCapsuleFolder()) return;
									const userInput = this.__askForMissingParameters(this.CLI['concept add'], { concept });
									if(userInput.isNecessary) return;

									if(_.isString(concept)) {
										const userInput = this.__askForMissingParameters(this.CLI['concept add'], { concept, conceptType });
										if(userInput.isNecessary) return;

										BixbyToolkit.data.conceptName = concept;
										BixbyToolkit.data.conceptType = conceptType;

										console.log();
										const subDir = conceptType === 'struc' ? '' : 'primitive/';

										TemplateBuilder.copyFileIfDoesntExist(`${this.sourcePath}/models/base/{{_self.conceptName}}.model.bxb.dot`, this.getPath(`models/${subDir}`), BixbyToolkit.data);
										console.log(` Concept ${concept} added.`);
									} else if('lib' in concept) {
										const alias = _.findKey(Libs, { appName:concept.lib });
										const library = _.extend({ alias }, Libs[alias]);

										if(!this.hasLibrary(library)) {
											this.addLibrary(library);
											console.log(` ${library.alias} library was missing and has been added to the imports. You can now start using ${concept.name} in your capsule.`);
										}
									} else {
										let conceptName = concept.name;
										const userInput = this.__askForMissingParameters(this.CLI['concept add'], { conceptName });
										if(userInput.isNecessary) return;
									}
								},
			'library add': 		(library) => {
									if(!this.__isInsideCapsuleFolder()) return;
									const userInput = this.__askForMissingParameters(this.CLI['library add'], { library });
									if(userInput.isNecessary) return;

									if(!this.hasLibrary(library)) {
										this.addLibrary(library);
										console.log(` ${library.alias} library imported.`);
									} else {
										throwWarning(`${library.alias} already imported. Command ignored.`);
									}

								},
			'grammar create': 	(inputCase='*', inputDetm='*', inputNum='*', ...terms) => {
				const GRAMMAR_FEATURE_ORDER = ['case','determination','numerus'];

				const entities = {
					'USA': {
						nominative: { 
							given: {
								singular: 'die Vereinigten Staaten',
								plural:   'blu'
							},
							shown: {
								singular: 'bla',
								plural:   'blo'
							}
						},
						locative: {
							given: { singular: 'in den Vereinigten Staaten'}
						},
						allative: {
							given: { singular: 'in die Vereinigten Staaten'}
						},
						ablative: {
							given: { singular: 'von den Vereinigten Staaten'}
						},
					},
					'maledives': {
						nominative: { 
							given: { 
								singular: 	'die Maledive', 
								plural: 	'die Malediven' 
							}
						},
						genitive: 	{
							given: { singular: 'der Malediven' }
						},
						dative: 	{
							given: { singular: 'den Malediven'}
						},
						accusative: {
							given: { singular: 'den Malediven'}
						}
					}
				}
				
				let features = [inputCase, inputDetm, inputNum];
				let dict = {};

				_.each(terms, term => {
					const entity 			= entities[term];
					let termValue 			= _.get(entity, features.join('.'));

					dict[term] = {};

					if(inputCase === '*') {
						dict[term] = entities[term];
					} else {
						dict[term] = _.pick(entities[term], inputCase);
					}

					if(inputDetm !== '*') {
						let determinations = {};
						_.each(dict[term], (dets, termCase) => {
							determinations[termCase] = _.pick(dets, inputDetm);


						});
						dict[term] = determinations;
					}
					
					if(inputNum !== '*') {
						_.each(dict[term], (dets, termCase) => {
							_.each(dets, (nums, termDet) => {
								console.log(termDet,'.....', nums);
								dets[termDet] = _.pick(nums, inputNum);
							});
						});
					}

					console.log(dict[term]);
					console.log('---------------');
					console.log('\n');
				});
				console.log('dict', JSON.stringify(dict, null, 4));

				const grammarDef = BixbyFormat.dialogs.createGrammarDefinition('base', dict);
				

				//BixbyIO.write('macro-logic-grammar.dialog.bxb', grammarDef);
			},
			'test': 			()	=> {
				// const entity = ;
				// const def = BixbyFormat.dialogs.createGrammarDefinition('case', entity);
 				// console.log(_.pick(entity, ['locative', 'default.plural']));
 				// BixbyIO.write('macro-logic-locations.dialog.json', def);
			},

			'--version': 		() 	=> 	console.log(__BTK_VERSION),
			'help': 			() 	=>	{
											console.log(' Thanks for using \x1b[46m\x1b[30mBixbyToolkit\x1b[0m! Here\'s a list of available commands:');
											console.log('\n');
											_.each(this.CLI, method => {
												if(method.name) {
													console.log('\t', method.name, '\t\t\t', _.get(method, 'description', ''));
													if(Object.values(this.CLIShortcuts).includes(method.name)) {
														console.log('\t  alias ', _.invert(this.CLIShortcuts)[method.name]);
													}
													console.log('\n');
												}
											});
										}
		};

		this.CLIShortcuts = {
			cc: 	'capsule create',
			ca: 	'concept add',
			rsa: 	'responseset add',
			ra: 	'response add',
			rr: 	'response remove',
			aa: 	'action add',
			la: 	'library add',
			ua: 	'utterance add',
			h: 		'help',
			'?': 	'help',
			//va: 	'vocab add',
			'-v': 	'--version'
		};

		this.CLI.config.description = '\t Retrieve or change configuration using "config [<configName>] [<newValue>]"';
		this.CLI['capsule create'].description = 'Create a capsule from a template using "capsule create <appName>"';
		this.CLI['concept add'].description = 'Add a concept from a library or create a new one';
		this.CLI['responseset add'].description = 'Add a response set to dialog files';
		this.CLI['response add'].description = '\t Add a response to a response set';
		this.CLI['response remove'].description = 'Remove a specific response from a response set';
		this.CLI['action add'].description = '\t Add an action (and according file skeleton structure)';
		this.CLI['library add'].description = '\t Import a global library for your capsule';
		//this.CLI['vocab add'].description = '\t Add a vocab (and according models)';
		this.CLI['--version'].description = '\t Get current capsule\'s version number';
		this.CLI['help'].description = '\t\t Display usage information';

		['capsule', 'responseset', 'response', /*'vocab', */'action', 'concept', 'library', 'utterance', 'grammar'].forEach(name => {
			this.CLI[name] = (subCommand, ...options) => {
				const command = `${name} ${subCommand}`;
				if(command in this.CLI) {
					this.CLI.activeModule = name;
					this.CLI[command].apply(this, options);
				}
			}
		});
	}

	getPath(which, file=false) {
		const handler = {
			dir: 		() => path.join(this.targetPath, which, file ? path.sep + file : ''),
			resources: 	() => {
							const language = _.get(BixbyToolkit.data, 'app.language', 'base');
							const targetDevice = _.get(BixbyToolkit.data, 'app.targetDevice', 'base');
							const dir = `${this.targetPath}/resources/${targetDevice}-${language}`;
							
							TemplateBuilder.createSubDirs(dir);

							if(file) return path.join(dir, file);
							return dir;
						},
			nlgFile: 	() => {
							let filePath = this.getPath('resources', BixbyFormat.dialogs.paths.nlgFile)
							if(fs.existsSync(filePath)) return filePath;
						},
			vocab: 		() => this.getPath('resources', 'vocab')
		};
		return (handler[which] || handler.dir)();
	}

	getModulePath() {
		return path.join(this.sourcePath, this.CLI.activeModule || '');
	}
	
	saveConfig(overwriteConfig={}) {
		let config = _.clone(BixbyToolkit.data);
		config = _.defaultsDeep(overwriteConfig, config, globals);
		delete config.the_field;
		delete config.user;

		_.each(config, (val, key) => {
			if(key.slice(0,7) === 'current' || _.isFunction(val)) 
				delete config[key];
		});
		fs.writeFileSync(BixbyToolkit.configPath, JSON.stringify(config, null, 4), 'utf8');
	} 

	addLibrary(library) {
		const capsulePath = path.join(this.targetPath, 'capsule.bxb');
		const capsuleBxb = BixbyIO.read(capsulePath);
		const entryPoint = _.find(capsuleBxb[0].capsule.entries, struc => _.has(struc, 'capsule-imports'));
		const shortName = library.appName.split('.').slice(-1)[0];
		const lib = { import: { parameters: library.appName, as: shortName, version: library.version || '1.0.0' } };

		BixbyIO.addEntry(lib, entryPoint, 'capsule-imports');
		BixbyIO.write(capsulePath, capsuleBxb);
	}
	
	hasLibrary(library) {
		const capsuleBxb = BixbyIO.read( path.join(this.targetPath, 'capsule.bxb') );
		const entryPoint = _.find(capsuleBxb[0].capsule.entries, struc => _.has(struc, 'capsule-imports'));

		let imports = _.get(entryPoint['capsule-imports'], 'entries', false);

		if(!imports) {
			imports = _.get(entryPoint['capsule-imports'], 'import', false);
			if(imports) imports = [imports];
		}

		if(imports) {
			imports = _.find(imports, { parameters: [library.appName] });
		}

		return !!imports;
	}

	__copyModule(module=false, template='base', targetPath=false, onDone=false) {
		if(module) this.CLI.activeModule = module;
		targetPath = targetPath || this.targetPath;

		if(path.extname(template).length) {
			this.CLI.activeModule = false;
		}

		const basePath = path.join(this.getModulePath(), template);

		this.__fetchQuestions(basePath);
		this.__askForTemplateVars(_.filter(BixbyToolkit.questions, 'active'), () => {
			TemplateBuilder.copyDir(basePath, targetPath, BixbyToolkit.data);
			if(this.verbose) console.log(' Copying from', basePath, 'to', targetPath, '...', this.targetPath);
			TemplateBuilder.renderAllTemplates(targetPath, BixbyToolkit.data);
			if(!this.silent) console.log(` ${this.CLI.activeModule[0].toUpperCase()}${this.CLI.activeModule.slice(1).toLowerCase()} created from ${template} template.`);

			TemplateBuilder.printFileList(this.targetPath);
			onDone && onDone();
		});
	}

	__fetchQuestions(templatePath) {
		const files = TemplateBuilder.collectAllTemplates(templatePath);
		
		files.forEach(filePath => {
			const file = TemplateBuilder.loadTemplate(filePath, templatePath, this.targetPath, BixbyToolkit.data);
			TemplateBuilder.parseTemplate(file.content, BixbyToolkit.data);
		});

		BixbyToolkit.questions = _.map(BixbyToolkit.questions, question => {
			question.default = question.value = _.get(BixbyToolkit.data, question.name);
			return question;
		});
	}

	__isInsideCapsuleFolder() {
		const isInside = fs.existsSync(BixbyToolkit.configPath);
		if(!isInside) {
			throwError('You are not inside a capsule folder!');
		}
		return isInside;
	}

	__askForMissingParameters(func, parameters) {
		let isNecessary = false;

		_.each(parameters, (val, parameter) => {
			if(parameter in Prompts) {
				const prompt = _.cloneDeep(Prompts[parameter]);

				if((_.isUndefined(val) && !prompt.optional) || (_.isEmpty(val) && !prompt.loop)) {
					const count = _.get(this.__askForMissingParameters, `counts.${parameter}`, 0) + 1;
					const isLoop = !!prompt.loop;

					if('source' in prompt) {
						prompt.type = 'autocomplete';
					} else {
						prompt.type = 'input';
					}

					prompt.name = parameter;
					isNecessary = true;

					_.set(this.__askForMissingParameters, `counts.${parameter}`, count);

					if(count === 1) {
						prompt.message = prompt.message.replace(/\[[^\]]+\]/g, '');
					} else {
						prompt.message = prompt.message.replace(/[\[\]]/g, '');
					}
					//console.log('count', _.get(this.__askForMissingParameters, `counts.${parameter}`, 0));

					inquirer
						.prompt(prompt)
						.catch(console.log)
						.then(answers => {
							const origParameters = _.cloneDeep(parameters);

							parameters[parameter] = answers[parameter];
							Prompts.setData(parameter, answers[parameter]);
							func.apply(this, Object.values(parameters));
							
							if(isLoop && answers[parameter].length > 0) {
								func.apply(this, Object.values(origParameters));
							}
						});
					return false;
				}
			} else {
				throwError(`No prompt found for "${parameter}".`);
			}
		});
		return { isNecessary };
	}

	__askForTemplateVars(questions, callback) {
		if(questions.length) {
			inquirer.prompt(questions).then(answers => {
				_.each(BixbyToolkit.questions, question => {
					const answer = _.get(answers, question.name);
					if(answer) {
						question.value = answer;
						question.active = false;
						_.set(BixbyToolkit.data, question.name, answer);
					}
				});
				callback && callback(answers);
			});
		} else {
			callback && callback();
		}
	}

	__reaskQuestions() {
		this.__fetchQuestions();
		this.__askForTemplateVars(BixbyToolkit.questions);
	}	
}

BixbyToolkit.data = {};
BixbyToolkit.questions = [];
BixbyToolkit.configPath = path.join(globals.homePath, '.btk-project');

let AppConfig = {};
const appPath = path.dirname(process.argv[0]);
const appConfigPath = path.join(appPath, './config.json');

if(fs.existsSync(appConfigPath)) {
	AppConfig = JSON.parse(fs.readFileSync(appConfigPath));
	console.log(' Loaded local config from', appConfigPath);
}

const templatePath = _.get(AppConfig, 'template-path', path.join( __dirname, 'templates'));

const BTK = new BixbyToolkit({
	sourcePath: templatePath,
	targetPath: globals.homePath, 
	verbose: 	false, 
});

Prompts.init(BTK);

const [NODE_PATH, __FILE__] = process.argv;
const CLIShortcut 	= BTK.CLIShortcuts[process.argv[2]];
const cliCommand 	= BTK.CLI[CLIShortcut || process.argv[2]];
const cliParams 	= process.argv.slice(3);

if(cliCommand) {
	cliCommand.apply(BTK, cliParams);
} else {
	console.log('');
	console.log(` \x1b[46m\x1b[30m Bixby Toolkit v${__BTK_VERSION} \x1b[0m – use 'bxb help' for usage info`);

	if(BixbyToolkit.isProjectDirectory) {
		console.log('');
		console.log(`	Capsule ${BixbyToolkit.data.app.namespace}.${BixbyToolkit.data.app.name} v${BixbyToolkit.data.app.version}`);
		console.log(`	${BixbyToolkit.data.app.language} on ${BixbyToolkit.data.app.targetDevice}`);
		console.log('');
	} else {
		throwWarning('You are not inside a capsule!');
	}
}