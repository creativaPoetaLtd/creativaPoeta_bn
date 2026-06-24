import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const start = async () => {
  const { default: app } = await import("./app");
  const port = Number(process.env.PORT || 5000);

  app.listen(port, "127.0.0.1", () => {
    console.log(`Creativa Poeta backend running at http://127.0.0.1:${port}`);
  });
};

void start();