import "dotenv/config";

// Testler DAIMA test veritabanina bakar. Bu satir olmasa .env'deki DATABASE_URL
// gelistirme veritabanina baglanirdi ve testler onun verisini silerdi.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error("TEST_DATABASE_URL tanimli degil. .env.example'a bak.");
}
process.env.DATABASE_URL = testUrl;
