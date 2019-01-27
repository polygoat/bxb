const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const Utils = require('../lib/utils');
const BixbyParser = {
	'*': 		require('./BixbyAnyParser'),
	'dialog': 	require('./BixbyDialogParser'),
	'utterance':require('./BixbyUtteranceParser')
}

module.exports = function(filePath) {
	let fileContent = fs.readFileSync(filePath, { encoding: 'utf8' });
	let extension = path.extname(path.basename(filePath, '.bxb')).slice(1);

	fileContent = Utils.removeComments(fileContent);
	if(!fileContent.length) {
		return [];
	}

	if(!(extension in BixbyParser)) {
		extension = '*';
	}

	parsed = BixbyParser[extension].parse(fileContent);
	this.parsingData = BixbyParser[extension].parsingData;
	this.lastPath = filePath;

	return parsed;
};