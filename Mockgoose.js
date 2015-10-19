'use strict';
var _ = require('lodash');

var mock = require('./lib/Model');
var db = require('./lib/db');
var logger = require('./lib/Logger');

module.exports = function (mongoose, throwErrors) {

    var Models = {};
    if (!mongoose.originalCreateConnection) {
        mongoose.originalCreateConnection = mongoose.createConnection;
        mongoose.originalConnect = mongoose.connect;
        mongoose.originalModel = mongoose.model;
        mongoose.Connection.prototype.originalModel = mongoose.Connection.prototype.model;
        mongoose.Connection.prototype.originalOpen = mongoose.Connection.prototype.open;
    }

    mongoose.model = mongoose.Connection.prototype.model = function (name, schema, collection, skipInit) {
        var model = this.originalModel(name, schema, collection, skipInit);
        mock(model);
        if(model.schema.options.autoIndex){
            model.ensureIndexes();
        }
        Models[name] = model;
        return model;
    };

    mongoose.Connection.prototype.open = function() {
        var connection = this;
        var args = _.slice(arguments);
        if(_.isFunction(_.last(args))) {
            var callback = args.pop();
            args.push(function(err) {
                process.nextTick(function() {
                    handleConnection(callback, connection, err);
                });
            });
        }

        this.originalOpen.apply(this, args);
    };

    mongoose.createConnection = function () {
        var args = _.slice(arguments);
        if(_.isFunction(_.last(args))) {
            var callback = args.pop();
            args.push(function(err) {
                process.nextTick(function() {
                    handleConnection(callback, connection, err);
                });
            });
        }

        var connection = mongoose.originalCreateConnection.apply(mongoose, args);
        return connection;
    };

    function handleConnection(callback, connection, err) {
        setMockReadyState(connection, 2);
        connection.emit('connecting');
        if (callback) {
            //Always return true as we are faking it.
            callback(null, connection);
        }
        if (throwErrors) {
            setMockReadyState(connection, 0);
            connection.emit('error', err);
        } else {
            setMockReadyState(connection, 1);
            connection.emit('connected');
            connection.emit('open');
        }
    }

    mongoose.connect = function (host, database, port, options, callback) {
        if (_.isFunction(database)) {
            callback = database;
            database = null;
        }
        if (!_.isString(database)) {
            database = host.slice(host.lastIndexOf('/') + 1);
        }
        if (_.isFunction(database)) {
            callback = database;
            options = {};
        } else if (_.isFunction(port)) {
            callback = port;
            options = {};
        } else if (_.isFunction(options)) {
            callback = options;
            options = {};
        }
        if (_.isObject(options)) {
            if (_.isString(options.db)) {
                database = options.db;
            }
            options = {};
        }
        if (_.isUndefined(options)) {
            options = {};
        }

        logger.info('Creating Mockgoose database: Connect ', database, ' options: ', options);
        mongoose.originalConnect(database, options, function (err) {
            handleConnection(callback, mongoose.connection, err);
        });
        mongoose.connection.model = mongoose.model;
        return mongoose;
    };

    var setMockReadyState = module.exports.setMockReadyState = function(connection, state) {
        /**
         * mock version of Connection#readyState
         * http://mongoosejs.com/docs/api.html#connection_Connection-readyState
         *
         * 0 = disconnected
         * 1 = connected
         * 2 = connecting
         * 3 = disconnecting
         *
         */
        connection._mockReadyState = mongoose.connection._mockReadyState = state;
    };

    module.exports.reset = function (type) {
        if (!type) {
            _.map(Models, function (value, key) {
                delete Models[key];
            });
        } else {
            delete Models[type];
        }
        db.reset(type);
    };
    return mongoose;
};
