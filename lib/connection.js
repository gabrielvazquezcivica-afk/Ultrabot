import * as baileys from '@whiskeysockets/baileys';
import chalk from 'chalk';
import readline from 'readline';

const makeWASocket = baileys.default;
const {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = baileys;

class UltraConnection {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    this.sock = null;
    this.retries = 0;
    this.maxRetries = 5;
    this.codigoGenerado = false;
  }

  async start() {
    console.log(chalk.blue.bold(`
╔════════════════════════════════════╗
║        ULTRABOT PRO ESTABLE        ║
╚════════════════════════════════════╝
`));

    await this.connect();
  }

  async connect() {
    const { state, saveCreds } = await useMultiFileAuthState('./sesion');
    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      browser: ['Windows', 'Chrome', '120.0.0'] // fingerprint estable
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      // 🔐 Generar código SOLO una vez y con delay
      if (!this.codigoGenerado && connection === 'connecting') {
        this.codigoGenerado = true;

        this.rl.question(
          chalk.cyan('\n📞 Número (ej: 5213312345678): '),
          async (numero) => {
            try {
              await this.sleep(3000); // 🧠 delay humano

              let code = await this.sock.requestPairingCode(numero);
              code = code?.match(/.{1,4}/g)?.join('-') || code;

              console.log(chalk.yellow.bold('\n🔑 CÓDIGO:\n'));
              console.log(chalk.green.bold(`👉 ${code}\n`));
              console.log(chalk.gray('→ WhatsApp > Dispositivos vinculados > Vincular con código\n'));

            } catch (err) {
              console.log(chalk.red('❌ Error generando código:'), err.message);
            }
          }
        );
      }

      if (connection === 'open') {
        console.log(chalk.green('\n✅ CONECTADO ESTABLE\n'));
        this.retries = 0;
        this.rl.close();
      }

      if (connection === 'close') {
        const reason = lastDisconnect?.error?.output?.statusCode;

        console.log(chalk.red(`\n❌ Conexión cerrada (${reason || 'unknown'})`));

        // 🚫 sesión cerrada manualmente
        if (reason === DisconnectReason.loggedOut) {
          console.log(chalk.red('🚫 Sesión inválida → borra carpeta /sesion'));
          return;
        }

        // 🔁 reconexión inteligente (backoff)
        if (this.retries < this.maxRetries) {
          this.retries++;

          const delay = this.getBackoff(this.retries);
          console.log(chalk.yellow(`🔄 Reintentando en ${delay / 1000}s... (intento ${this.retries})`));

          await this.sleep(delay);
          this.connect();
        } else {
          console.log(chalk.red('🛑 Demasiados intentos. Espera 1–2 minutos.'));
        }
      }
    });
  }

  getBackoff(attempt) {
    // ⏱️ backoff progresivo (anti-ban)
    const base = 5000;
    return base * attempt;
  }

  sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
  }
}

export default UltraConnection;
