import dotenv from "dotenv";

const result = dotenv.config();

console.log("===== DOTENV DEBUG =====");
console.log("Config result:", result);
console.log("Error:", result.error);
console.log("Parsed:", result.parsed);
console.log("MONGO_URI from env:", process.env.MONGO_URI);
console.log("========================");