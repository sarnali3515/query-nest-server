const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const port = process.env.PORT || 5000;

const app = express();

const corsOptions = {
    origin: ['http://localhost:5173'],
    credentials: true,
}
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser())


// verify jwt middleware
const verifyToken = (req, res, next) => {
    const token = req.cookies?.token;
    if (!token) {
        return res.status(401).send({ message: 'Unauthorized Access' })
    }
    if (token) {
        jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
            if (err) {
                console.log(err)
                return res.status(401).send({ message: 'Unauthorized Access' })
            }
            console.log(decoded);
            req.user = decoded
            next()
        })
    }
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.sgvl42h.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        const queriesCollection = client.db('queryNest').collection('queries');
        const recommendationCollection = client.db('queryNest').collection('recommendation');

        // jwt
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '7d'
            })
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
            })
                .send({ success: true })
        })

        // clear token
        app.get('/logout', (req, res) => {
            res
                .clearCookie('token', {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                    maxAge: 0,
                })
                .send({ success: true })
        })

        // get all queries
        app.get('/queries', async (req, res) => {
            const result = await queriesCollection.find().sort({ _id: -1 }).toArray();
            res.send(result);
        })

        //get by email
        app.get('/queries/:email', verifyToken, async (req, res) => {
            const tokenEmail = req.user.email;
            const email = req.params.email;
            if (tokenEmail !== email) {
                return res.status(403).send({ message: 'Forbidden Access' })
            }
            const query = { userEmail: email }
            const result = await queriesCollection.find(query).toArray();
            res.send(result)
        })

        //delete a query
        app.delete('/query/:id', verifyToken, async (req, res) => {

            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await queriesCollection.deleteOne(query);
            res.send(result)
        })

        // save a query
        app.post('/queries', async (req, res) => {
            const queryData = req.body;
            console.log(queryData)
            const result = await queriesCollection.insertOne(queryData);
            res.send(result)
        })

        //get a single query
        app.get('/query/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await queriesCollection.findOne(query);
            res.send(result);
        })

        // update a query in db
        app.put('/query/:id', async (req, res) => {
            const id = req.params.id;
            const queryData = req.body;
            const query = { _id: new ObjectId(id) }
            const options = { upsert: true }
            const updateDoc = {
                $set: {
                    ...queryData,
                },
            }
            const result = await queriesCollection.updateOne(query, updateDoc, options);
            res.send(result);
        })

        // save a recommendation
        app.post('/recommendation', async (req, res) => {
            const recommendationData = req.body;
            console.log(recommendationData)
            const result = await recommendationCollection.insertOne(recommendationData);
            res.send(result)
        })

        app.get('/recommendation', verifyToken, async (req, res) => {
            const result = await recommendationCollection.find().toArray();
            res.send(result);
        })

        //  get my recommendation 
        app.get('/my-recommendation/:email', verifyToken, async (req, res) => {
            const tokenEmail = req.user.email;
            const email = req.params.email;
            if (tokenEmail !== email) {
                return res.status(403).send({ message: 'Forbidden Access' })
            }
            const query = { recommenderEmail: email }
            const result = await recommendationCollection.find(query).toArray();
            res.send(result)
        })
        //  delete my recommendation 
        app.delete('/recommendation/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await recommendationCollection.deleteOne(query);
            res.send(result)
        })

        // get recommendations for me
        app.get('/recommendation-me/:email', verifyToken, async (req, res) => {
            const tokenEmail = req.user.email;
            const email = req.params.email;
            if (tokenEmail !== email) {
                return res.status(403).send({ message: 'Forbidden Access' })
            }
            const query = { userEmail: email }
            const result = await recommendationCollection.find(query).toArray();
            res.send(result)
        })


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Query Nest is running')
})

app.listen(port, () => {
    console.log(`Query Nest server is running on port ${port}`)
})
