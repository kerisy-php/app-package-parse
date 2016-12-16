bplistParser =  (function () {
    var debug = false;
    var maxObjectSize = 100 * 1000 * 1000;
    var maxObjectCount = 32768;
    function bplistParser(buffer) {
        this.buffer = buffer;
        this.offsetTable = [];
        this.topObject = 0;
        this.objectRefSize = 1;
    }
    
    bplistParser.prototype.parse = function(){
        this.getOffsetInfo();
        return this.parseObject(this.topObject);
    };
    
    bplistParser.prototype.getOffsetInfo = function(){
        // Handle trailer, last 32 bytes of the file
        var trailer = this.buffer.slice(this.buffer.length - 32, this.buffer.length);
        // 6 null bytes (index 0 to 5)
        var offsetSize = readUInt8(trailer, 6);
        if (debug) {
          console.log("offsetSize: " + offsetSize);
        }
        this.objectRefSize = readUInt8(trailer, 7);
        if (debug) {
          console.log("objectRefSize: " + this.objectRefSize);
        }
        var numObjects = readUInt64BE(trailer, 8);
        if (debug) {
          console.log("numObjects: " + numObjects);
        }
        this.topObject = readUInt64BE(trailer, 16);
        if (debug) {
          console.log("topObject: " + this.topObject);
        }
        var offsetTableOffset = readUInt64BE(trailer, 24);
        if (debug) {
          console.log("offsetTableOffset: " + offsetTableOffset);
        }
        
        if (numObjects > maxObjectCount) {
            throw new Error("maxObjectCount exceeded");
        }

        // Handle offset table
        for (var i = 0; i < numObjects; i++) {
            var offsetBytes = this.buffer.slice(offsetTableOffset + i * offsetSize, offsetTableOffset + (i + 1) * offsetSize);
            this.offsetTable[i] = readUIntBE(offsetBytes, 0);
            if (debug) {
                console.log("Offset for Object #" + i + " is " + this.offsetTable[i] + " [" + this.offsetTable[i].toString(16) + "]");
            }
        }
    };
    
    bplistParser.prototype.parseObject = function(tableOffset) {
        var offset = this.offsetTable[tableOffset];
        var type = this.buffer[offset];
        var objType = (type & 0xF0) >> 4; //First  4 bits
        var objInfo = (type & 0x0F);      //Second 4 bits
        switch (objType) {
            case 0x0:
                return this.parseSimple(objInfo, objType);
            case 0x1:
                return this.parseInteger(objInfo, offset);
            case 0x8:
                return this.parseUID(objInfo, offset);
            case 0x2:
                return this.parseReal(objInfo, offset);
            case 0x3:
                return this.parseDate(objInfo, offset);
            case 0x4:
                return this.parseData(objInfo, offset);
            case 0x5: // ASCII
                return this.parsePlistString(objInfo, offset);
            case 0x6: // UTF-16
                return this.parsePlistString(objInfo, offset, true);
            case 0xA:
                return this.parseArray(objInfo, offset);
            case 0xD:
                return this.parseDictionary(objInfo, offset);
            default:
                throw new Error("Unhandled type 0x" + objType.toString(16));
        }
    };

    bplistParser.prototype.parseSimple = function(objInfo, objType) {
        //Simple
        switch (objInfo) {
            case 0x0: // null
                return null;
            case 0x8: // false
                return false;
            case 0x9: // true
                return true;
            case 0xF: // filler byte
                return null;
            default:
                throw new Error("Unhandled simple type 0x" + objType.toString(16));
        }
    };

    bplistParser.prototype.parseInteger = function(objInfo, offset) {
        var length = Math.pow(2, objInfo);
//        if (length > 4) {
//            var data = this.buffer.slice(offset + 1, offset + 1 + length);
//            var str = bufferToHexString(data);
//            return bigInt(str, 16);
//        }
        if (length < maxObjectSize) {
            return readUIntBE(this.buffer.slice(offset + 1, offset + 1 + length));
        } else {
            throw new Error("To little heap space available! Wanted to read " + length + " bytes, but only " + maxObjectSize + " are available.");
        }
    };

    bplistParser.prototype.parseUID = function(objInfo, offset) {
        var length = objInfo + 1;
        if (length < maxObjectSize) {
            return new UID(readUIntBE(this.buffer.slice(offset + 1, offset + 1 + length)));
        } else {
            throw new Error("To little heap space available! Wanted to read " + length + " bytes, but only " + maxObjectSize + " are available.");
        }
    };

    bplistParser.prototype.parseReal = function(objInfo, offset) {
        var length = Math.pow(2, objInfo);
        if (length < maxObjectSize) {
            var realBuffer = this.buffer.slice(offset + 1, offset + 1 + length);
            if (length === 4) {
                return realBuffer.readFloatBE(0);
            } else if (length === 8) {
                return realBuffer.readDoubleBE(0);
            }
        } else {
            throw new Error("To little heap space available! Wanted to read " + length + " bytes, but only " + maxObjectSize + " are available.");
        }
    };

    bplistParser.prototype.parseDate = function(objInfo, offset) {
        if (objInfo != 0x3) {
            console.error("Unknown date type :" + objInfo + ". Parsing anyway...");
        }
        var dateBuffer = this.buffer.slice(offset + 1, offset + 9);
        return new Date(EPOCH + (1000 * dateBuffer.readDoubleBE(0)));
    };

    bplistParser.prototype.parseData = function(objInfo, offset) {
        var dataoffset = 1;
        var length = objInfo;
        if (objInfo == 0xF) {
            var int_type = this.buffer[offset + 1];
            var intType = (int_type & 0xF0) / 0x10;
            if (intType != 0x1) {
                console.error("0x4: UNEXPECTED LENGTH-INT TYPE! " + intType);
            }
            var intInfo = int_type & 0x0F;
            var intLength = Math.pow(2, intInfo);
            dataoffset = 2 + intLength;
            if (intLength < 3) {
                length = readUIntBE(this.buffer.slice(offset + 2, offset + 2 + intLength));
            } else {
                length = readUIntBE(this.buffer.slice(offset + 2, offset + 2 + intLength));
            }
        }
        if (length < maxObjectSize) {
            return this.buffer.slice(offset + dataoffset, offset + dataoffset + length);
        } else {
            throw new Error("To little heap space available! Wanted to read " + length + " bytes, but only " + maxObjectSize + " are available.");
        }
    };

    bplistParser.prototype.parsePlistString = function(objInfo, offset, isUtf16) {
        isUtf16 = isUtf16 || 0;
        var enc = "utf8";
        var length = objInfo;
        var stroffset = 1;
        if (objInfo == 0xF) {
            var int_type = this.buffer[offset + 1];
            var intType = (int_type & 0xF0) / 0x10;
            if (intType != 0x1) {
                console.err("UNEXPECTED LENGTH-INT TYPE! " + intType);
            }
            var intInfo = int_type & 0x0F;
            var intLength = Math.pow(2, intInfo);
            var stroffset = 2 + intLength;
            if (intLength < 3) {
                length = readUIntBE(this.buffer.slice(offset + 2, offset + 2 + intLength));
            } else {
                length = readUIntBE(this.buffer.slice(offset + 2, offset + 2 + intLength));
            }
        }
        // length is String length -> to get byte length multiply by 2, as 1 character takes 2 bytes in UTF-16
        length *= (isUtf16 + 1);
        if (length < maxObjectSize) {
            var plistString = new Buffer(this.buffer.slice(offset + stroffset, offset + stroffset + length));
            if (isUtf16) {
                plistString = swapBytes(plistString);
                enc = "ucs2";
            }
            return plistString.toString(enc);
        } else {
            throw new Error("To little heap space available! Wanted to read " + length + " bytes, but only " + maxObjectSize + " are available.");
        }
    };

    bplistParser.prototype.parseArray = function(objInfo, offset) {
        var length = objInfo;
        var arrayoffset = 1;
        if (objInfo == 0xF) {
            var int_type = this.buffer[offset + 1];
            var intType = (int_type & 0xF0) / 0x10;
            if (intType != 0x1) {
                console.error("0xa: UNEXPECTED LENGTH-INT TYPE! " + intType);
            }
            var intInfo = int_type & 0x0F;
            var intLength = Math.pow(2, intInfo);
            arrayoffset = 2 + intLength;
            if (intLength < 3) {
                length = readUIntBE(this.buffer.slice(offset + 2, offset + 2 + intLength));
            } else {
                length = readUIntBE(this.buffer.slice(offset + 2, offset + 2 + intLength));
            }
        }
        if (length * this.objectRefSize > maxObjectSize) {
            throw new Error("To little heap space available!");
        }
        var array = [];
        for (var i = 0; i < length; i++) {
            var objRef = readUIntBE(this.buffer.slice(offset + arrayoffset + i * this.objectRefSize, offset + arrayoffset + (i + 1) * this.objectRefSize));
            array[i] = this.parseObject(objRef);
        }
        return array;
    };

    bplistParser.prototype.parseDictionary = function(objInfo, offset) {
        var length = objInfo;
        var dictoffset = 1;
        if (objInfo == 0xF) {
            var int_type = this.buffer[offset + 1];
            var intType = (int_type & 0xF0) / 0x10;
            if (intType != 0x1) {
                console.error("0xD: UNEXPECTED LENGTH-INT TYPE! " + intType);
            }
            var intInfo = int_type & 0x0F;
            var intLength = Math.pow(2, intInfo);
            dictoffset = 2 + intLength;
            if (intLength < 3) {
                length = readUIntBE(this.buffer.slice(offset + 2, offset + 2 + intLength));
            } else {
                length = readUIntBE(this.buffer.slice(offset + 2, offset + 2 + intLength));
            }
        }
        if (length * 2 * this.objectRefSize > maxObjectSize) {
            throw new Error("To little heap space available!");
        }
        if (debug) {
            console.log("Parsing dictionary #" + this.topObject);
        }
        var dict = {};
        for (var i = 0; i < length; i++) {
            var keyRef = readUIntBE(this.buffer.slice(offset + dictoffset + i * this.objectRefSize, offset + dictoffset + (i + 1) * this.objectRefSize));
            var valRef = readUIntBE(this.buffer.slice(offset + dictoffset + (length * this.objectRefSize) + i * this.objectRefSize, offset + dictoffset + (length * this.objectRefSize) + (i + 1) * this.objectRefSize));
            var key = this.parseObject(keyRef);
            var val = this.parseObject(valRef);
            if (debug) {
                console.log("  DICT #" + this.topObject + ": Mapped " + key + " to " + val);
            }
            dict[key] = val;
        }
        return dict;
    };
    
    function bufferToHexString(buffer) {
        var str = '';
        var i;
        for (i = 0; i < buffer.length; i++) {
            if (buffer[i] != 0x00) {
                break;
            }
        }
        for (; i < buffer.length; i++) {
            var part = '00' + buffer[i].toString(16);
            str += part.substr(part.length - 2);
        }
        return str;
    }
    
    function readUIntBE(buffer, start) {
        start = start || 0;

        var l = 0;
        for (var i = start; i < buffer.length; i++) {
            l <<= 8;
            l |= buffer[i] & 0xFF;
        }
        return l;
    }
    
    function readUInt8(buffer, offset, noAssert) {
        if (!noAssert)
            checkOffset(offset, 1, buffer.length)
        return buffer[offset]
    }
    
    function readUInt64BE(buffer, start) {
        var data = buffer.slice(start, start + 8);
        return readUInt32BE(data, 4, 8);
    }
    
    function readUInt32BE(buffer, offset, noAssert) {
        if (!noAssert)
            checkOffset(offset, 4, buffer.length)

        return (buffer[offset] * 0x1000000) +
                ((buffer[offset + 1] << 16) |
                        (buffer[offset + 2] << 8) |
                        buffer[offset + 3])
    }
    
    function swapBytes(buffer) {
        var len = buffer.length;
        for (var i = 0; i < len; i += 2) {
            var a = buffer[i];
            buffer[i] = buffer[i + 1];
            buffer[i + 1] = a;
        }
        return buffer;
    }
    
    function checkOffset(offset, ext, length) {
        if ((offset % 1) !== 0 || offset < 0)
            throw new RangeError('offset is not uint')
        if (offset + ext > length)
            throw new RangeError('Trying to access beyond buffer length')
    }
    
    return bplistParser;
})();