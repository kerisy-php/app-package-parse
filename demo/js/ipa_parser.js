(function(obj) {

	var requestFileSystem = obj.webkitRequestFileSystem || obj.mozRequestFileSystem || obj.requestFileSystem;

	zip.useWebWorkers = false;

	function onerror(message) {
		alert(message);
	}

	function createTempFile(callback) {
		var tmpFilename = "tmp.dat";
		requestFileSystem(TEMPORARY, 4 * 1024 * 1024 * 1024, function(filesystem) {
			function create() {
				filesystem.root.getFile(tmpFilename, {
					create : true
				}, function(zipFile) {
					callback(zipFile);
				});
			}

			filesystem.root.getFile(tmpFilename, null, function(entry) {
				entry.remove(create, create);
			}, create);
		});
	}

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
		}
		};
	})();

	(function() {
		var fileInput = document.getElementById("file-input");
		var fileList = document.getElementById("file-list");

		var getStringFromBytes = function(bytes, start, end) {
	        var string = "";
	        bytes = bytes.slice(start, end);
	        for (index = 0; index < bytes.length; index++) {
	            string += String.fromCharCode(bytes[index]);
	        }
	        return string;
	    };

		var ipaInfoPlistReader = function(blob, callback){
		    var read = new FileReader;
		    read.onload = function (event) {
		        buffer = new Uint8Array(read.result);
		        var plistObject = {};
		        var str = getStringFromBytes(buffer, 0, 6);
		        if ("bplist" == str) {
		            plistObject = new bplistParser(buffer).parse();
		            callback(plistObject);
		        } else if ("<?xml " == str) {
		            var reader2 = new FileReader();
			        reader2.onload = function(e) {
			        	var xml = e.target.result;
						plistObject = PlistParser.parse(xml);
						callback(plistObject);
			        };
			        reader2.readAsText(blob);
		        } else {
		            throw new Error('Invalid ipa')
		        }
		    }, read.onerror = function (event) {
		        if(event.target.error.code === event.target.error.NOT_READABLE_ERR) {
		            throw new Error("Failed to read file: " + blob.name);
		        }
		    };
		    try {
		        read.readAsArrayBuffer(blob);
		    } catch (e) {
		        alert(e);
		    }
		};

		//获取版本号、应用名、包名
		function getPListData(entry, entries) {
			var objStr = entry.filename;
			var reg = new RegExp();
			reg.compile("Payload/[^/]*.app/Info.plist", "g");

			if(objStr.match(reg)){
				model.getEntryFile(entry, function(blob) {
					var PDisplayName = BundleIdentifier = Version = '';
					var PIcon = IconPng = [];
					
					ipaInfoPlistReader(blob, function(plistObject){
						fileList.innerHTML = format(JSON.stringify(plistObject));
						console.log(plistObject);
					});
				});
			}
		}

		function getPListIconData(icon, entries) {
			var iconList = [];
			for(var i in icon){
				//console.log(icon[i]);
				entries.forEach(function(entry) {
					var objStr = entry.filename;
					var reg = new RegExp();
					reg.compile("Payload/[^/]*.app/"+icon[i]+"[^]*.png", "g");
					if(objStr.match(reg)){
						iconList.push(objStr)
					}
				});
			}

			return iconList;
		}

		if (typeof requestFileSystem == "undefined"){
			creationMethodInput.options.length = 1;
		}

		fileInput.addEventListener('change', function() {
			model.getEntries(fileInput.files[0], function(entries) {
				entries.forEach(function(entry) {
					getPListData(entry, entries);
				});
			});

		}, true);

	})();

})(this);