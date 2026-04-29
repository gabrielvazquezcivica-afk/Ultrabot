import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import chalk from 'chalk';
import readline from 'readline';
import Pino from 'pino';

class LibConnection {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        this.sock = null;
    }

    async connect() {
        console.log(chalk.blue.bold(`
╔═════════════════════════════════════════════════╗
║                                                 ║
║              CONEXIÓN ULTRABOT                  ║
║                                                 ║
╚═════════════════════════════════════════════════╝
`));

        console.log(chalk.cyan('📌 Formato: código de país + número, sin signos ni ceros al inicio'));
        console.log(chalk.gray('Ejemplo: 5213331234567\n'));

        return new Promise((resolver, rechazar) => {
            this.rl.question(chalk.white('Ingresa tu número: '), async (numero) => {
                const numeroLimpio = numero.trim();

                if (!/^\d+$/.test(numeroLimpio)) {
                    console.log(chalk.red('⚠️ Solo ingresa números válidos'));
                    this.rl.close();
                    return rechazar(new Error('Número en formato incorrecto'));
                }

                try {
                    const resultado = await this.iniciarProceso(numeroLimpio);
                    resolver(resultado);
                } catch (err) {
                    rechazar(err);
                }
            });
        });
    }

    async iniciarProceso(numeroUsuario) {
        const { state, saveCreds } = await useMultiFileAuthState('./sesion');

        // Configuración ajustada para versiones actuales y Termux
        this.sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            syncFullHistory: false,
            markOnlineOnConnect: true,
            connectTimeoutMs: 180000,
            keepAliveIntervalMs: 30000,
            defaultQueryTimeoutMs: 120000,
            retryRequestDelayMs: 5000,
            fireInitQueries: false,
            browser: ['Linux', 'Chrome', '125.0.0.0'],
            logger: Pino({ level: 'silent' })
        });

        this.sock.ev.on('creds.update', saveCreds);

        return new Promise((resolver, rechazar) => {
            let codigoYaMostrado = false;

            this.sock.ev.on('connection.update', async (actualizacion) => {
                const { connection, code, error } = actualizacion;

                // Si ya se conectó correctamente
                if (connection === 'open') {
                    console.log(chalk.green.bold('\n✅ ¡CONECTADO EXITOSAMENTE A WHATSAPP!'));
                    console.log(chalk.gray('→ El bot ya está funcionando correctamente\n'));
                    this.rl.close();
                    return resolver(this.sock);
                }

                // Si se cierra la conexión
                if (connection === 'close') {
                    const causa = error?.output?.statusCode 
                        ? DisconnectReason[error.output.statusCode] 
                        : error?.message || 'Desconocida';

                    console.log(chalk.yellow(`⚠️ Conexión cerrada temporalmente: ${causa}`));
                    console.log(chalk.yellow('🔄 Intentando restablecer...\n'));

                    // Solo rechazamos si es por sesión inválida, sino dejamos que siga intentando
                    if (causa === DisconnectReason.loggedOut || causa === 'Session Closed') {
                        this.rl.close();
                        return rechazar(new Error('Sesión cerrada, elimina la carpeta sesion y vuelve a intentar'));
                    }
                }

                // Mostramos el código solo una vez cuando esté listo
                if (code && !codigoYaMostrado) {
                    codigoYaMostrado = true;
                    console.log(chalk.cyan.bold(`\n🔑 TU CÓDIGO DE VINCULACIÓN ES: ${code}`));
                    console.log(chalk.gray(`→ Número asociado: ${numeroUsuario}`));
                    console.log(chalk.gray('📋 Pasos para usarlo:'));
                    console.log(chalk.gray('   1. Abre WhatsApp en tu teléfono'));
                    console.log(chalk.gray('   2. Ve a Ajustes ➜ Dispositivos vinculados'));
                    console.log(chalk.gray('   3. Selecciona: "Vincular con número de teléfono"'));
                    console.log(chalk.gray('   4. Escribe el código que aparece arriba\n'));
                }
            });

            // Pedimos el código solo cuando la conexión ya está lista
            const obtenerCodigo = async () => {
                try {
                    // Esperamos tiempo suficiente para que no se corte
                    await new Promise(espera => setTimeout(espera, 5000));

                    if (!this.sock.authState.creds.registered) {
                        await this.sock.requestPairingCode(numeroUsuario);
                    }
                } catch (err) {
                    console.log(chalk.red(`⚠️ Al generar código: ${err.message}`));
                    // No detenemos el proceso, seguimos intentando
                    setTimeout(() => obtenerCodigo(), 3000);
                }
            };

            obtenerCodigo();
        });
    }
}

export default LibConnection;
                               
