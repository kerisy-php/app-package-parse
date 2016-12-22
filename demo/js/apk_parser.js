(function(obj) {
	zip.useWebWorkers = false;
	var model = (function() {
		var URL = obj.mozURL || obj.URL;
		return {
			getEntries : function(file, onend) {
				zip.createReader(new zip.BlobReader(file), function(zipReader) {
					zipReader.getEntries(onend);
				}, onerror);
			},
			getEntryFile : function(entry, onend, onprogress) {
				entry.getData(new zip.BlobWriter(), function(blob) {
					onend(blob);
				}, onprogress);
			},
			getEntry : function(entries, filename, reg) {
		        if(reg) {
		            var regExp = new RegExp();
		            regExp.compile(filename, "g");
		        }
		        for(var i= 0, len = entries.length; i < len;  i++ ) {
		            if(reg) {
		                if(entries[i].filename.match(regExp)) {
		                    return entries[i];
		                }
		            } else if( entries[i].filename === filename) {
		                return entries[i];
		            };
		        }
		        return false;
		    }
		};
	})();

	(function() {
		var fileInput = document.getElementById("file-input");
		var fileList = document.getElementById("file-list");

		var ApkResourceReader = function(blob, callback) {
		    var read = new FileReader;
		    read.onload = function (event) {
		        buffer = new Uint8Array(read.result);
		        var resourceTable = ApkResourceFinder.getResourceTable(buffer);
		        callback(resourceTable);
		    }, read.onerror = function (event) {
		        event.target.error.code == event.target.error.NOT_READABLE_ERR && alert("Failed to read file: " + blob.name);
		    };
		    try {
		        read.readAsArrayBuffer(blob);
		    } catch (e) {
		        alert(e);
		    }
		};

		function processManifestJson(thejson, resourceTable){
		    for(var e in thejson){
		        if(typeof thejson[e] === 'object') {
		            thejson[e] = processManifestJson(thejson[e], resourceTable);
		        } else if(typeof thejson[e] == 'string' && thejson[e].indexOf('@') === 0 && typeof resourceTable[thejson[e]] != "undefined") {
		            thejson[e] = resourceTable[thejson[e]][0];
		        }
		    }
		    return thejson;
		}

		var ApkManifestReader = function (blob, resourceTable, callback) {
		    var read = new FileReader;
		    read.onload = function (event) {
		        buffer = new Uint8Array(read.result);
		        var manifest = new ManifestParser(buffer).parse();
		        manifest = processManifestJson(manifest, resourceTable);
		        callback(manifest);
		    }, read.onerror = function (event) {
		        event.target.error.code == event.target.error.NOT_READABLE_ERR && alert("Failed to read file: " + blob.name);
		    };
		    try {
		        read.readAsArrayBuffer(blob);
		    } catch (e) {
		        alert(e);
		    }
		};

		fileInput.addEventListener('change', function() {
			model.getEntries(fileInput.files[0], function(entries) {
				var entry = model.getEntry(entries, 'resources.arsc');
				if(entry !== false) {
					model.getEntryFile(entry, function(blob){
						ApkResourceReader(blob, function(resourceTable){
							var entry = model.getEntry(entries, 'AndroidManifest.xml');
							if(entry !== false) {
								model.getEntryFile(entry, function(blob){
									ApkManifestReader(blob, resourceTable, function(manifest){
										fileList.innerHTML = format(JSON.stringify(manifest));
										console.log(manifest);
									});
								});
							} else {
								alert('无法解析该包');
								return;
							}
						});
					});
				} else {
					alert('无法解析该包');
					return;
				}

				
			});

		}, true);
	})();
})(this);