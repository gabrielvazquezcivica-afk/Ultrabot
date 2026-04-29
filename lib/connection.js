import chalk from 'chalk';
import figlet from 'figlet';
import readline from 'readline';
import makeWASocket, { 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion 
} from '@whiskeysockets/baileys';
import P from 'pino';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

export default class LibConnection {

    mostrarTitulo() {
        console.log(
            chalk.greenBright.bold(
                figlet.textSync('UltraBot', {
                    font: 'Big',
                    horizontalLayout: 'default',
                    verticalLayout: 'default'
                })
            )
        );

        console.log(chalk.cyan('='.repeat(60)));
        console.log(chalk.yellowBright.bold('🔗 CONEXIÓN ULTRABOT'));
        console.log(chalk.cyan('='.repeat(60)) + '\n');
    }

    preguntarConexion() {
        return new Promise((resolve) => {
            console.log(chalk.blueBright('📲 ¿Cómo quieres conectar?\n'));
            console.log(chalk.green('1. Código QR'));
            console.log(chalk.green('2. Código (Pairing Code)\n'));

            rl.question(chalk.yellow('👉 Selecciona opción (1 o 2): '), (respuesta) => {
                resolve(respuesta.trim());
            });
        });
    }

    preguntarNumero() {
        return new Promise((resolve) => {
            rl.question(
                chalk.yellow('\n📞 Ingresa tu número (ej: 5213312345678): '),
                (numero) => resolve(numero.trim())
            );
        });
    }

    async connect() {
        this.mostrarTitulo();

        const opcion = await this.preguntarConexion();

        const { state, saveCreds } = await useMultiFileAuthState('./session');
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: state,
            logger: P({ level: 'silent' }),
            printQRInTerminal: opcion === '1'
        });

        // Guardar credenciales
        sock.ev.on('creds.update', saveCreds);

        // Si elige código
        if (opcion === '2') {
            const numero = await this.preguntarNumero();

            try {
                const code = await sock.requestPairingCode(numero);
                console.log(
                    chalk.greenBright.bold(`\n🔑 Tu código de vinculación:\n👉 ${code}\n`)
                );
            } catch (err) {
                console.log(chalk.red(`❌ Error al generar código: ${err.message}`));
            }
        }

        // Eventos de conexión
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'connecting') {
                console.log(chalk.yellow('⏳ Conectando a WhatsApp...'));
            }

            if (connection === 'open') {
                console.log(chalk.greenBright.bold('✅ Conectado correctamente a WhatsApp\n'));
            }

            if (connection === 'close') {
                const motivo = lastDisconnect?.error?.output?.statusCode;

                if (motivo === DisconnectReason.loggedOut) {
                    console.log(chalk.red('❌ Sesión cerrada. Elimina la carpeta session y vuelve a conectar.'));
                } else {
                    console.log(chalk.yellow('🔄 Reconectando automáticamente...'));
                    this.connect();
                }
            }
        });

        return sock;
    }
}
