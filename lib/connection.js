import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import chalk from 'chalk';
import readline from 'readline';

class LibConnection {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async connect() {
        // Título principal
        console.log(chalk.blue.bold(`
╔═════════════════════════════════════════════════╗
║                                                 ║
║              CONEXIÓN ULTRABOT                  ║
║                                                 ║
╚═════════════════════════════════════════════════╝
`));

        // Instrucciones claras
        console.log(chalk.cyan('📌 Formato del número: código de país + tu número, sin signos ni ceros al inicio'));
        console.log(chalk.gray('Ejemplo: 18549995761\n'));

        return new Promise((resolver, rechazar) => {
            this.rl.question(chalk.white('Ingresa tu número para generar el código: '), async (numero) => {
                const numeroLimpio = numero.trim();

                if (!/^\d+$/.test(numeroLimpio)) {
                    console.log(chalk.red('⚠️ Solo escribe números, inténtalo de nuevo'));
                    this.rl.close();
                    return rechazar(new Error('Formato de número incorrecto'));
                }

                try {
                    const cliente = await this.iniciarProceso(numeroLimpio);
                    resolver(cliente);
                } catch (error) {
                    rechazar(error);
                }
            });
        });
    }

    async iniciarProceso(numeroUsuario) {
        const { state, saveCreds } = await useMultiFileAuthState('./sesion');

        // ⚙️ Configuración corregida y optimizada para Termux
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            syncFullHistory: false,
            markOnlineOnConnect: true,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            defaultQueryTimeoutMs: 60000,
            // Cambiamos la identificación para evitar bloqueos y errores de conexión
            browser: ['Ubuntu', 'Chrome', '20.0.0'],
            version: [2, 3000, 1021391307]
        });

        // Guardar datos de sesión
        sock.ev.on('creds.update', saveCreds);

        // 🛠️ Manejo completo de estados y errores
        sock.ev.on('connection.update', async (actualizacion) => {
            const { connection, code, error, qr } = actualizacion;

            // Si la conexión se abre correctamente
            if (connection === 'open') {
                console.log(chalk.green.bold('\n✅ ¡CONECTADO CORRECTAMENTE A WHATSAPP!'));
                console.log(chalk.gray('→ Ya puedes usar todas las funciones del bot\n'));
                this.rl.close();
            }

            // Si la conexión se cierra
            if (connection === 'close') {
                const motivo = DisconnectReason[error?.output?.statusCode];
                console.log(chalk.red(`❌ Conexión cerrada: ${motivo || error?.message || 'Desconocido'}`));

                // Si es un error que se puede solucionar volviendo a conectar
                if (motivo !== DisconnectReason.loggedOut) {
                    console.log(chalk.yellow('🔁 Intentando restablecer conexión...\n'));
                    // No lanzamos error para que no reinicie todo el bot innecesariamente
                    return;
                } else {
                    console.log(chalk.red('⚠️ Sesión cerrada, deberás vincular nuevamente\n'));
                }
            }

            // 🎯 Mostrar el código de vinculación cuando esté listo
            if (code) {
            console.log(chalk.green('\n✅ Conexión establecida con éxito, generando código...'));
                console.log(chalk.cyan.bold(`\n🔑 TU CÓDIGO DE VINCULACIÓN ES: ${code}`));
                console.log(chalk.gray(`→ Número asociado: ${numeroUsuario}`));
                console.log(chalk.gray('📋 Pasos para vincular:'));
                console.log(chalk.gray('   1. Abre WhatsApp en tu teléfono'));
                console.log(chalk.gray('   2. Ve a Ajustes > Dispositivos vinculados'));
                console.log(chalk.gray('   3. Toca en "Vincular con número de teléfono"'));
                console.log(chalk.gray('   4. Escribe el código que aparece arriba\n'));
            }
        });

        // 🔐 Solicitar código de forma correcta y segura
        if (!sock.authState.creds.registered) {
            // Esperamos un momento antes de pedir el código para evitar errores
            await new Promise(res => setTimeout(res, 3000));
            try {
                await sock.requestPairingCode(numeroUsuario);
            } catch (err) {
                console.log(chalk.red(`⚠️ Error al generar el código: ${err.message}`));
                this.rl.close();
                throw err;
            }
        }

        return sock;
    }
}

export default LibConnection;
                
