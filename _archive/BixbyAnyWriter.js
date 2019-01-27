const _ = require('lodash');
const fs = require('fs');

const __QUOTED_LITERALS = ['template', 'speech'];

let __condition = false;

function __render(struc, key, indents) {
	indents = indents || 0;
	if(key === 'entries') indents--;
	const hasParams = struc && struc.hasOwnProperty('parameters');
	const hasEntries = struc && struc.hasOwnProperty('entries');
	const needsQuotationMarks = __QUOTED_LITERALS.indexOf(key) > -1;
	let indentation = _.repeat('\t', indents);
	let output = '';

	if(key === 'parameters') {
		return '';
	}

	if(_.isNumber(key)) {
		key = '';
	}

	if(hasParams) {
		key += ' (';
		
		if(needsQuotationMarks) {
			key += '"';
		}

		if(_.isArray(struc.parameters)) {
			key += struc.parameters.join(', ');
		} else {
			key += struc.parameters;
		}

		if(needsQuotationMarks) {
			key += '"';
		}
		key += ')';
	}

	if(_.isNull(struc)) {
		output = `${indentation}${key}\n${indentation.slice(0,-3)}`;
	} else if(_.isString(struc)) {
		if(needsQuotationMarks) {
			struc = `"${struc}"`;
		}
		output = `${indentation}${key} (${struc})\n`;
	} else if(_.isArray(struc) && _.every(struc, _.isString)) {
		struc = struc.join(', ');
		if(needsQuotationMarks) {
			struc = `"${struc}"`;
		}
		output += `${indentation}${key} (${struc})\n`;
	} else if(_.isObject(struc)) {
		if(!_.isUndefined(key) && key.length) {
			output += `${indentation}${key} {\n`;
		}
		
		if(hasEntries) {
			struc = struc.entries;
			indents--;
		}

		if(_.isArray(struc) && _.isUndefined(key)) {
			indents--;
		}

		_.each(struc, (entry, key) => output += __render(entry, key, indents+1));

		if(!_.isUndefined(key) && key.length) {
			output += `${indentation}}\n`;
		}
	}
	return `${output}`;
}

module.exports = (filePath, content) => {
	let fileContent = __render(content, undefined, -1);
	fs.writeFileSync(filePath, fileContent);
};