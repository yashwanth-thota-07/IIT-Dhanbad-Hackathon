const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

const mongo = process.env.MONGO_URI;

async function connectDB() {
    try{
     await mongoose.connect(mongo);
     console.log("sucessfully connected to database");}
     catch(err){
        console.log(err);
     }
}

module.exports = connectDB;