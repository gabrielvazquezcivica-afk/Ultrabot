import chalk from 'chalk';
import figlet from 'figlet';
import readline from 'readline';
import baileys from '@whiskeysockets/baileys';
import P from 'pino';

// ✅ Import seguro
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = baileys;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

export default class LibConnection {

    mostrarTitulo() {
        console.log(
            chalk.blueBright.bold(
                figlet.textSync('UltraBot', { font: 'Big' })
            )
        );

        console.log(chalk.cyan('='.repeat(60)));
        console.log(chalk.greenBright.bold('🔗 CONEXIÓN ULTRABOT'));
        console.log(chalk.cyan('='.repeat(60)) + '\n');
    }

    preguntarConexion() {
        return new Promise((resolve) => {
            console.log(chalk.blueBright('📲 ¿Cómo quieres conectar?\n'));
            console.log(chalk.green('1. Código QR'));
            console.log(chalk.green('2. Código (Pairing Code)\n'));

            rl.question(chalk.yellow('👉 Selecciona opción (1 o 2): '), (res) => {
                resolve(res.trim());
            });
        });
    }

    preguntarNumero() {
        return new Promise((resolve) => {
            rl.question(
                chalk.yellow('\n📞 Ingresa tu número (ej: +1 555 123 4567): '),
                (num) => resolve(num.trim())
            );
        });
    }

    // 🔥 Formateo universal
    formatearNumero(numero) {
        numero = numero.replace(/[^0-9]/g, '');

        if (numero.length === 10) return '521' + numero; // México
        if (numero.length >= 11 && numero.length <= 15) return numero;

        throw new Error('Número inválido');
    }

    async connect() {
        try {
            this.mostrarTitulo();

            const opcion = await this.preguntarConexion();

            const { state, saveCreds } = await useMultiFileAuthState('./session');
            const { version } = await fetchLatestBaileysVersion();

            const sock = makeWASocket({
                version,
                auth: state,
                logger: P({ level: 'silent' }),
                printQRInTerminal: opcion === '1',
                browser: ['UltraBot', 'Chrome', '1.0.0']
            });

            // 💾 Guardar sesión
            sock.ev.on('creds.update', saveCreds);

            // 🔐 Pairing Code
            if (opcion === '2') {
                let numero = await this.preguntarNumero();

                try {
                    numero = this.formatearNumero(numero);
                    console.log(chalk.cyan(`📞 Número: ${numero}`));

                    const code = await sock.requestPairingCode(numero);

                    console.log(
                        chalk.greenBright.bold(`\n🔑 Código:\n👉 ${code}\n`)
                    );

                } catch (err) {
                    console.log(chalk.red(`❌ ${err.message}`));
                }
            }

            // 🔄 Eventos conexión (FIX REAL)
            sock.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'connecting') {
                    console.log(chalk.yellow('⏳ Conectando a WhatsApp...'));
                }

                if (connection === 'open') {
                    console.log(
                        chalk.greenBright.bold('\n✅ Conectado correctamente\n')
                    );
                }

                if (connection === 'close') {
                    const reason = lastDisconnect?.error?.output?.statusCode;

                    console.log(chalk.red('\n🔌 Conexión cerrada'));

                    if (reason === DisconnectReason.loggedOut) {
                        console.log(
                            chalk.red('❌ Sesión cerrada. Borra "session" y vuelve a conectar.')
                        );
                    } else {
                        console.log(
                            chalk.yellow('⚠️ Esperando reconexión automática...')
                        );
                    }
                }
            });

            return sock;

        } catch (error) {
            console.log(chalk.red(`❌ Error: ${error.message}`));
        }
    }
            }
