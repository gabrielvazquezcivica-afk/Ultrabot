// 🟢 Importación corregida, así sí reconoce todas las funciones
import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys';
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
        console.log(chalk.blue.bold(`
╔═════════════════════════════════════════════════╗
║                                                 ║
║              CONEXIÓN ULTRABOT                  ║
║                                                 ║
╚═════════════════════════════════════════════════╝
`));

        console.log(chalk.magenta.bold('\n¿Cómo quieres conectarte? Elige una opción:\n'));
        console.log(chalk.yellow('1️⃣  qr → Escaneando código con tu celular'));
        console.log(chalk.yellow('2️⃣  codigo → Usando código de 8 dígitos\n'));

        return new Promise((resolver, rechazar) => {
            this.rl.question(chalk.white('Escribe tu elección: '), async (respuesta) => {
                const opcion = respuesta.trim().toLowerCase();

                if (opcion === 'qr' || opcion === '1') {
                    console.log(chalk.green('\n👉 Modo seleccionado: Código QR'));
                    try {
                        const cliente = await this.iniciarProceso('qr');
                        resolver(cliente);
                    } catch (error) {
                        rechazar(error);
                    }
                }

                else if (opcion === 'codigo' || opcion === '2') {
                    console.log(chalk.green('\n👉 Modo seleccionado: Código de 8 dígitos'));
                    console.log(chalk.cyan('📌 Ejemplo de cómo poner tu número: 523331234567'));
                    console.log(chalk.gray('→ Formato: código de país + tu número, sin ceros ni signos al inicio\n'));

                    this.rl.question(chalk.white('Ingresa tu número: '), async (numero) => {
                        const numeroLimpio = numero.trim();

                        if (/^\d+$/.test(numeroLimpio)) {
                            try {
                                const cliente = await this.iniciarProceso('codigo', numeroLimpio);
                                resolver(cliente);
                            } catch (error) {
                                rechazar(error);
                            }
                        } else {
                            console.log(chalk.red('⚠️ Solo debes escribir números, inténtalo de nuevo'));
                            this.rl.close();
                            rechazar(new Error('Formato de número incorrecto'));
                        }
                    });
                }

                else {
                    console.log(chalk.red('⚠️ Opción no reconocida. Reinicia y elige entre las opciones disponibles'));
                    this.rl.close();
                    rechazar(new Error('Opción de conexión no válida'));
                }
            });
        });
    }

    async iniciarProceso(modo, numeroUsuario = null) {
        const { state, saveCreds } = await useMultiFileAuthState('./sesion');

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: modo === 'qr',
            syncFullHistory: false
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (actualizacion) => {
            const { connection, qr, code, error } = actualizacion;

            if (connection === 'open') {
                console.log(chalk.green.bold('✅ ¡CONECTADO CORRECTAMENTE A WHATSAPP!'));
                console.log(chalk.gray('→ Ya puedes usar todas las funciones del bot\n'));
                this.rl.close();
            }

            if (connection === 'close') {
                if (error) console.log(chalk.red(`❌ Conexión cerrada → Motivo: ${error.message || 'Desconocido'}`));
            }

            if (modo === 'qr' && qr) {
                console.log(chalk.yellow.bold('\n📲 ESCANEA ESTE CÓDIGO QR:'));
                console.log(chalk.gray('→ Abre WhatsApp > Dispositivos vinculados > Vincular un dispositivo\n'));
            }

            if (modo === 'codigo' && code) {
                console.log(chalk.cyan.bold(`\n🔑 TU CÓDIGO DE VINCULACIÓN ES: ${code}`));
                console.log(chalk.gray(`→ Para el número: ${numeroUsuario}`));
                console.log(chalk.gray('→ Ingresa este código en tu aplicación de WhatsApp\n'));
            }
        });

        if (modo === 'codigo' && numeroUsuario) {
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
