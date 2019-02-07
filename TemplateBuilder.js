//parent:btk.js

const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const glob = require('glob');
const doT = require('dot');

doT.templateSettings.evaluate =    	/\{\{:([\s\S]+?)\}\}/g;
doT.templateSettings.interpolate = 	/\{\{_([\s\S]+?)\}\}/g;
doT.templateSettings.encode =      	/\{\{!([\s\S]+?)\}\}/g;
doT.templateSettings.use =         	/\{\{\+([\s\S]+?)\}\}/g;
doT.templateSettings.define =      	/\{\{\+\+\s*([\w\.$]+)\s*(\:|=)([\s\S]+?)#\}\}/g;
doT.templateSettings.conditional = 	/\{\{\?(\?)?\s*([\s\S]*?)\s*\}\}/g;
doT.templateSettings.iterate =     	/\{\{\*\s*(?:\}\}|([\s\S]+?)\s*\:\s*([\w$]+)\s*(?:\:\s*([\w$]+))?\s*\}\})/g;
doT.templateSettings.varname = 	 	'self';
doT.templateSettings.strip = 		true;
doT.templateSettings.append = 		true;
doT.templateSettings.selfcontained= false;

Builder = {
	files: 				{},
	verbose: 			false,

	clearFileList: 		function() { 
							this.files = {};
						},
	createSubDirs: 		(fullPath) => {
							let subDirs = fullPath.split(/[\\\/]+/g);
							let subDir;
							let dir = [];

							while(subDir = subDirs.shift()) {
								dir.push(subDir);
								if(!fs.existsSync(dir.join('/'))) {
									fs.mkdirSync(dir.join('/'));
								}
							}
						},
	copyFileIfDoesntExist: function(sourcePath, targetPath, dataContainer) {
							const filename = path.basename(sourcePath);
							const filePath = path.dirname(sourcePath);
							const isTemplate = path.extname(filename) == '.dot';
							let basename = `${filename}`;

							if(isTemplate) {
								basename = path.basename(filename, '.dot');
							}
							


							if(!fs.existsSync(path.join(targetPath, basename))) {
								if(isTemplate) {
									const file = this.loadTemplate(`${filePath}/${filename}`, '', targetPath, dataContainer);
									this.files[filename] = { source: sourcePath, target: path.join(targetPath, basename), content:file };
									this.renderTemplate(file, filename, targetPath, dataContainer);
								} else {
									this.files[filename] = { source: sourcePath, target: path.join(targetPath, basename) };
									fs.copyFileSync(filename, `${targetPath}/${basename}`);
								}
								return true;
							}
							return false;
						},
	copyDir: 			function(sourcePath, targetPath, dataContainer) {
							let searchPath = `${sourcePath}`;

							if(!path.extname(sourcePath).length) {
								searchPath += '/**/*';
							}

							let files = glob.sync(searchPath);
							files = files.filter(file => path.extname(file) !== '.dot');

							this.createSubDirs(targetPath);

							files.forEach(file => {
								const relPath = path.relative(sourcePath, file);
								let targetFilePath = this.parseTemplate(`${targetPath}/${relPath}`, dataContainer);

								targetFilePath = targetFilePath.replace(/\.dot$/g, '');

								if(fs.lstatSync(file).isDirectory()) {
								    this.createSubDirs(targetFilePath);
								} else {
								    fs.copyFileSync(file, targetFilePath);
								}
								_.set(this.files, `${relPath}.source`, path.resolve(file));
								_.set(this.files, `${relPath}.target`, targetFilePath);
							});
							if(this.verbose) console.log(`${files.length} files/directories copied.`);
						},
	loadTemplate: 		function(filePath, basePath, targetPath, dataContainer) {
							const content = fs.readFileSync(filePath, 'utf8').replace(/[\n]/g,'<br>').replace(/\t/g,'<tab>');
							const source = path.resolve(filePath);
							let target = path.join(targetPath, path.basename(source)).replace(/.dot$/, '');
							target = this.parseTemplate(target, dataContainer);

							const file = {content, source, target};
							this.files[path.basename(filePath)] = file;
							//console.log('\t\\' + fileList);	// list created files
							return file;
						},	
	parseTemplate: 		(template, dataContainer) => doT.template(template)(dataContainer),
	printFileList: 		function(targetPath) {
							this.clearFileList();
						},
	collectAllTemplates:(filePath) => glob.sync(`${filePath}/**/*.dot`),				
	renderAllTemplates: function(targetPath, dataContainer){ 
							_.each(this.files, (file, key) => this.renderTemplate(file, key, targetPath, dataContainer));
						},
	renderTemplate: 	function(file, key, targetPath, dataContainer) {
							if(file.source && !fs.lstatSync(file.source).isDirectory()) {
								const rendered = this.parseTemplate(file.content, dataContainer);

								targetPath = this.parseTemplate(targetPath, dataContainer);

								delete this.files[key];
								key = this.parseTemplate(key, dataContainer);
								key = key.split('.dot')[0];

								this.files[key] = file;
								
								this.createSubDirs(targetPath);

								fs.writeFileSync(file.target, rendered.replace(/<br>/g, '\n').replace(/<tab>/g, '\t'));
								if(this.verbose) console.log(`"${file.target}" created.`);
							}
						}
}

module.exports = Builder;