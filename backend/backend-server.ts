import express from 'express';
import { IncomingMessage, Server, ServerResponse } from 'http';

const responseString = 'Hello from backend Server';

export interface IBackendServer {
  PORT: number;
  server: Server<typeof IncomingMessage, typeof ServerResponse>;

  /**
   * Returns the HTTP Server corresponding to the Express app.
   *
   * @public
   * @returns {Server<typeof IncomingMessage, typeof ServerResponse>}
   */
  getServer(): Server<typeof IncomingMessage, typeof ServerResponse>;

  /**
   * Closes the express server and returns with the server object.
   *
   * @public
   * @returns {Server<typeof IncomingMessage, typeof ServerResponse>}
   */
  close(): Server<typeof IncomingMessage, typeof ServerResponse>;
}

export class BackendServer implements IBackendServer {
    PORT: number;
    server: Server<typeof IncomingMessage, typeof ServerResponse>;

    //

    constructor(port: number) {
        // Initialize parameters
        this.PORT = port;

        const app = this.createExpressApp();
        const server = app.listen(port, () => {
            console.log('Backend Server listening on port ' + this.PORT);
        });

        this.server = server;
    }

    //

    /**
     * Gets the Server instance
     */
    public getServer(): Server<typeof IncomingMessage, typeof ServerResponse> {
        return this.server;
    }

    /**
     * properly closing the server
     */
    public close(): Server<typeof IncomingMessage, typeof ServerResponse> {
        const server = this.server.close();
        console.log(`Closed Backend Server with port ${this.PORT}`);
        return server;
    }

    /**
     * creates instance of Express App 
     */
    private createExpressApp() {
        const app = express();

        // Attach parsers
        app.use(express.text());
        app.use(express.json());

        app.get('/ping', (req, res) => {
            res.sendStatus(200);
        });

        app.get('/', (req, res) => {
            res.status(200).send(`[${req.hostname}:${this.PORT}]` + responseString);
        });

        return app;
    }
}