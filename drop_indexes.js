import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "./config/db.js";

const dropIndexes = async () => {
  try {
    await connectDB();
    const db = mongoose.connection.db;
    
    // We get the index list
    const favCollection = db.collection('favourites');
    if (favCollection) {
      const indexes = await favCollection.indexes();
      console.log("Existing indexes on favourites:", indexes.map(i => i.name));
      
      const oldIndexes = ["user_1", "tour_1", "city_1", "user_1_tour_1"];
      for (const idx of oldIndexes) {
        if (indexes.find(i => i.name === idx)) {
          await favCollection.dropIndex(idx);
          console.log(`Dropped old index ${idx} from favourites collection.`);
        }
      }
    }

  } catch (error) {
    console.error("Error dropping indexes:", error);
  } finally {
    process.exit(0);
  }
};

dropIndexes();
