import mongoose from "mongoose";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB!");
  const modelsPath = path.join(__dirname, 'models');
  const files = fs.readdirSync(modelsPath);
  for (const file of files) {
    if (!file.endsWith('.js')) continue;
    try {
        const m = await import('file://' + path.join(modelsPath, file));
        const md = m.default;
        const count = await md.countDocuments();
        console.log(`Collection ${file} has ${count} documents.`);
        if(count > 0) {
            const sample = await md.findOne().lean();
            console.log(JSON.stringify(sample).substring(0, 300));
        }
    } catch(e) {
      console.log('Error reading model:', file, e.message);
    }
  }
  process.exit(0);
}
run();
