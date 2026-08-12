import "dotenv/config";
import { app } from "./app";

const PORTA = process.env.PORT || 3333;

app.listen(PORTA, () => {
  console.log(`Servidor da Casa de Carnes Oliveiras rodando na porta ${PORTA}`);
});
