const express = require('express');
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccount.json");
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000;

// middlewares
app.use(cors())
app.use(express.json())
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const verifyToken = (req, res, next) => {
    if (!req.headers.authorization) {
        return res.status(401).send({ message: 'Forbidden access' })
    }
    const token = req.headers.authorization.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'Forbidden access' })
        }
        req.user = decoded
        // console.log('decoded', decoded)
        next()
    })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.g8eto.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
        await client.connect();

        const userCollection = client.db('RichterDb').collection("users");
        const menuCollection = client.db('RichterDb').collection("menu");
        const reviewCollection = client.db('RichterDb').collection("reviews");
        const cartCollection = client.db('RichterDb').collection("cart");
        const paymentCollection = client.db('RichterDb').collection("payments");
        // middleware
        const verifyAdmin = async (req, res, next) => {
            const email = req.user.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            // verify is it an admin account or not
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next()
        }


        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ token })
        })

        // middlewares

        // user related api only admin access
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            // console.log(req.user)
            const result = await userCollection.find().toArray();
            res.send(result)
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists', insertedId: null })
            }
            const result = await userCollection.insertOne(user);
            res.send(result)
        });

        // delete user from firebase and database as well
        app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;
            const email = req.query.email; // query parameter email passes from client side
            if (email) {
                const userRecord = await admin.auth().getUserByEmail(email);
                await admin.auth().deleteUser(userRecord.uid)
            }
            const query = { _id: new ObjectId(id) };
            const result = await userCollection.deleteOne(query);
            res.send(result)
        });
        // users admin related api
        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            };
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result)
        })

        app.get('/users/admin/:id', verifyToken, async (req, res) => {
            const email = req.params.id;
            console.log(req.user.email)
            if (email !== req.user.email) {
                return res.status(403).send({ message: 'unauthorized access' })
            }
            const query = { email: email }
            const user = await userCollection.findOne(query)
            let admin = false;
            if (user) {
                admin = user?.role === 'admin'
            }
            res.send({ admin })
        })

        // menu
        app.get('/menu', async (req, res) => {
            const result = await menuCollection.find().toArray();
            res.send(result)
        })

        app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
            const item = req.body;
            const result = await menuCollection.insertOne(item);
            res.send(result)
        })

        app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: id };
            console.log(query)
            const result = await menuCollection.deleteOne(query);
            res.send(result)
        })

        app.get('/menu/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: id };
            const result = await menuCollection.findOne(query)
            res.send(result)
        })

        app.patch('/menu/:id', async (req, res) => {
            const item = req.body;
            const id = req.params.id;
            const filter = { _id: id };
            const updatedDoc = {
                $set: {
                    name: item.name,
                    category: item.category,
                    price: item.price,
                    recipe: item.price,
                    image: item?.image
                }
            }
            const result = await menuCollection.updateOne(filter, updatedDoc);
            res.send(result)
        })

        // cart
        app.get('/reviews', async (req, res) => {
            const result = await reviewCollection.find().toArray()
            res.send(result)
        })

        // cart collection

        app.get('/carts', async (req, res) => {
            const email = req.query.email;
            const query = {
                email: email
            }
            const result = await cartCollection.find(query).toArray();
            res.send(result)
        })

        app.post('/carts', async (req, res) => {
            const cartItem = req.body;
            const result = await cartCollection.insertOne(cartItem);
            res.send(result)
        })

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartCollection.deleteOne(query);
            res.send(result)
        })

        // payment intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            console.log(amount)
            // console.log(stripe.paymentIntents)
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            // console.log(paymentIntent)
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        // payment related api
        app.get('/payments/:email',verifyToken, async(req, res) => {
            const query = {email: req.params.email};
            if(req.params.email !== req.user.email){
                return res.send(403).send({message: 'forbidden access'})
            }
            const result = await paymentCollection.find(query).toArray();
            res.send(result)
        })

        app.post('/payments', async(req, res) => {
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment); //inset payment info in db collection
            
            // carefully delete each item from the cart of the user or cartCollection
            console.log(payment.cartIds)
            const query = {
            _id: {
            $in: payment.cartIds.map(id => new ObjectId(id))
           }};
           const deletedResult = await cartCollection.deleteMany(query);
           res.send({paymentResult, deletedResult})
        })

        // stats analytics
        app.get('/admin-stats', verifyToken, verifyAdmin, async(req, res) => {
            const users = await userCollection.estimatedDocumentCount();
            const menuItems = await menuCollection.estimatedDocumentCount();
            const orders = await paymentCollection.estimatedDocumentCount();
            // this is not the best way
            // const payments = await paymentCollection.find().toArray();
            // const revenue = payments.reduce((total, payment) => total + payment.price, 0);

            const result = await paymentCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: {
                            $sum: '$price'
                        }
                    }
                }
            ]).toArray();

            const revenue = result.length > 0 ? result[0].totalRevenue : 0;

            res.send({
                users,
                menuItems,
                orders,
                revenue
        })
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


app.get('/', async (req, res) => {
    res.send('richter restaurant server')
})

app.listen(port, () => {
    console.log(`web is running on port: ${port}`)
})