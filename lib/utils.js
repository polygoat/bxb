const _ = require('lodash');

exports.id = 'lib/utils';
module.exports = {
	findCommonHead: lookup => {
		let commonPart = '';
		let currentLength = 1;
		let foundHead = false;

		while(!foundHead) {
			_.each(lookup, entry => {
				const head = entry.slice(0, currentLength);
				if(commonPart.length < currentLength) commonPart = head;
				if(commonPart != head) {
					foundHead = true;
					commonPart = commonPart.slice(0,-1);
					return false;
				}
			});
			currentLength++;
		}
		return commonPart;
	}
};

String.prototype.escapeString = function() {
	input = this.toString();
	if(input[0] === '"') {
		if(input[input.length-1] === '"') {
			input = input.slice(1, -1);
		}
	}
	return input.replace(/(^|[^\\])"/g, '$1\\"');
};