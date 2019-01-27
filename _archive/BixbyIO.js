module.exports = {

	lastPath: 	false,

	read: 		require('./BixbyAnyReader'),
	write: 		require('./BixbyAnyWriter'),
	save(content) {
		return this.write(this.lastPath, content);
	},
	addEntry: 	(entry, entryStruc) => {
					const firstKey = Object.keys(entryStruc)[0];
					if(typeof entryStruc[firstKey] === 'string') {
							let parameters = [entryStruc[firstKey]];
							entryStruc[firstKey] = {
								entries: 	[entry]
							};
							entryStruc.parameters = parameters;
					} else if(firstKey !== 'entries') {
						let firstSubKey = Object.keys(entryStruc[firstKey])[0];
						let parameters = entryStruc[firstKey][firstSubKey].parameters.slice(0);
						delete entryStruc[firstKey][firstSubKey].parameters;

						entryStruc[firstKey][firstSubKey] = {
							entries: [entryStruc[firstKey][firstSubKey], entry],
							parameters
						};
					} else {
						entryStruc[firstKey].push(entry);
					}
				},
	removeEntry: (responseNr, entryStruc) => {
					entryStruc.entries.splice(responseNr-1, 1);
				 },
	addParameter: (param, paramStruc) => {
					if(typeof paramStruc.parameters == 'string') {
						paramStruc.parameters = [paramStruc.parameters, param];
					} else {
						paramStruc.parameters.push(param);
					}
				 }
};