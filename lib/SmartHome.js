/**
 * NodeRED Google SmartHome
 * Copyright (C) 2018 Michael Jacobsen.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

'use strict';

const bodyParser    = require('body-parser');
const https         = require('https');
const session       = require('express-session');
const express       = require('express');
const stoppable     = require('stoppable');
//const fetch          = require('node-fetch');
const morgan        = require('morgan');
const cors          = require('cors');
const storage       = require('node-persist');
const path          = require('path');
const fs            = require('fs');

const Emitter       = require('events').EventEmitter;
const Aggregation   = require('./Aggregation.js');
const Auth          = require('./Auth.js');
const Devices       = require('./Devices.js');
const HttpAuth      = require('./HttpAuth.js');
const HttpActions   = require('./HttpActions.js');

/******************************************************************************************************************
 * GoogleSmartHome
 *
 */
class GoogleSmartHome extends Aggregation(Auth, Devices, HttpAuth, HttpActions, Emitter) {
    constructor(username, password, httpsPort, publicKey, privateKey, jwtkey, clientid, clientsecret) {
        super();

        this.httpsPort  = httpsPort;
        this.publicKey  = publicKey;
        this.privateKey = privateKey;

        this.setJwtKey(jwtkey);
        this.setClientIdSecret(clientid, clientsecret);
        this.setUsernamePassword(username, password);

        // create express middleware
        this.app = express();
        this.app.use(cors());
        this.app.use(morgan('dev'));
        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({extended: true}));
        this.app.set('trust proxy', 1); // trust first proxy
        this.app.use(session({
            genid: (req) => {
              return this.genRandomString();
            },
            secret: 'xyzsecret',
            resave: false,
            saveUninitialized: true,
            cookie: {secure: false},
        }));

        // frontend UI
        this.app.set('jsonp callback name', 'cid');
        this.app.use('/frontend', express.static(path.join(__dirname, 'frontend')));
        this.app.use('/frontend/', express.static(path.join(__dirname, 'frontend')));
        this.app.use('/', express.static(path.join(__dirname, 'frontend')));

        this.httpAuthRegister();        // login and oauth http interface
        this.httpActionsRegister();     // actual SmartHome http interface
    }
    //
    //
    //
    Start() {
        const graceMilliseconds = 500;
        let me                  = this;

        // set SSL certificate
        const httpsOptions = {
            key  : fs.readFileSync(this.privateKey),
            cert : fs.readFileSync(this.publicKey)
        };

        // create our HTTPS server
        this.httpServer = stoppable(https.createServer(httpsOptions, this.app), graceMilliseconds);

        // start server
        this.httpServer.listen(this.httpsPort, () => {
            const host = me.httpServer.address().address;
            const port = me.httpServer.address().port;
          
            me.debug('SmartHome:Start(listen): listening at ' + host + ':' + port);
          
            process.nextTick(() => {
                me.emit('server', 'start', this.httpsPort);
            });
        });

        me.debug('SmartHome:Start(): registered routes:');
        this.app._router.stack.forEach((r) => {
            if (r.route && r.route.path) {
                me.debug('SmartHome:Start(): ' + r.route.path);
            }
        });
    }
    //
    //
    //
    Stop(done) {
        this.httpServer.stop(function() {
            if (typeof done === 'function') {
                done();
            }
        });

        let me = this;

        setImmediate(function(){
            me.httpServer.emit('close');
        });
    }
    //
    //
    //
    debug(data) {
        var str = 'D' + this.dateString() + ': ' + data;
        console.log(str);
    }
    //
    //
    //
    dateString(utc) {
        var ts_hms = new Date()
        
        if (typeof utc !== 'undefined' && utc === true) {
            // get UTC
            var nowText =   ts_hms.getUTCFullYear() + '-' + 
                            ("0" + (ts_hms.getUTCMonth() + 1)).slice(-2) + '-' + 
                            ("0" + (ts_hms.getUTCDate())).slice(-2) + 'T' +
                            ("0" + ts_hms.getUTCHours()).slice(-2) + ':' +
                            ("0" + ts_hms.getUTCMinutes()).slice(-2) + ':' +
                            ("0" + ts_hms.getUTCSeconds()).slice(-2)
    
            return nowText;
        } else {
            // get local time
            var nowText =   ts_hms.getFullYear() + '-' + 
                            ("0" + (ts_hms.getMonth() + 1)).slice(-2) + '-' + 
                            ("0" + (ts_hms.getDate())).slice(-2) + 'T' +
                            ("0" + ts_hms.getHours()).slice(-2) + ':' +
                            ("0" + ts_hms.getMinutes()).slice(-2) + ':' +
                            ("0" + ts_hms.getSeconds()).slice(-2)
    
            return nowText;
        }
    }
}

(async () => {
    await storage.init( /* options ... */ );
})();

module.exports = GoogleSmartHome;
