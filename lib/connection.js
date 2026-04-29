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

        // 🛠️ CONFIGURACIÓN TOTALMENTE AJUSTADA Y PROBADA
        this.sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            connectTimeoutMs: 180000,
            keepAliveIntervalMs: 25000,
            defaultQueryTimeoutMs: 120000,
            retryRequestDelayMs: 8000,
            fireInitQueries: false,
            shouldSyncHistoryMessage: false,
            browser: ['Ubuntu', 'Firefox', '115.0.0'],
            version: [2, 2814, 12],
            logger: Pino({ level: 'silent' })
        });

        this.sock.ev.on('creds.update', saveCreds);

        return new Promise((resolver, rechazar) => {
            let codigoGenerado = false;

            this.sock.ev.on('connection.update', async (actualizacion) => {
                const { connection, code, error } = actualizacion;

                // ✅ CONECTADO CORRECTAMENTE
                if (connection === 'open') {
                    console.log(chalk.green.bold('\n✅ ¡CONECTADO EXITOSAMENTE A WHATSAPP!'));
                    console.log(chalk.gray('→ El bot ya está funcionando correctamente\n'));
                    this.rl.close();
                    return resolver(this.sock);
                }

                // ⚠️ SI SE CIERRA LA CONEXIÓN
                if (connection === 'close') {
                    const razon = error?.output?.statusCode 
                        ? DisconnectReason[error.output.statusCode] 
                        : 'Motivo desconocido';

                    console.log(chalk.red(`❌ Conexión cerrada: ${razon}`));

                    // Solo rechazamos si es por cierre de sesión, sino dejamos que intente seguir
                    if (razon === DisconnectReason.loggedOut || razon === 'invalid_session') {
                        this.rl.close();
                        return rechazar(new Error('Sesión inválida o cerrada, elimina la carpeta de sesión'));
                    }
                }

                // 🔑 CUANDO APARECE EL CÓDIGO
                if (code && !codigoGenerado) {
                    codigoGenerado = true;
                    console.log(chalk.cyan.bold(`\n🔑 TU CÓDIGO DE VINCULACIÓN ES: ${code}`));
                    console.log(chalk.gray(`→ Número asociado: ${numeroUsuario}`));
                    console.log(chalk.gray('📋 Pasos para usarlo:'));
                    console.log(chalk.gray('   1. Abre WhatsApp en tu teléfono'));
                    console.log(chalk.gray('   2. Ve a Ajustes ➜ Dispositivos vinculados'));
                    console.log(chalk.gray('   3. Selecciona la opción: "Vincular con número de teléfono"'));
                    console.log(chalk.gray('   4. Escribe el código que ves arriba\n'));
                }
            });

            // ⏳ Pedimos el código SOLO cuando estamos seguros que la conexión está lista
            const pedirCodigo = async () => {
                try {
                    // Esperamos lo necesario para evitar que se cierre
                    await new Promise(espera => setTimeout(espera, 6000));

                    if (!this.sock.authState.creds.registered) {
                        await this.sock.requestPairingCode(numeroUsuario);
                    }
                } catch (err) {
                    console.log(chalk.red(`⚠️ Error al solicitar código: ${err.message}`));
                    // No cerramos ni rechazamos, dejamos que siga intentando
                }
            };

            pedirCodigo();
        });
    }
}

export default LibConnection;
