import { default as makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
import chalk from 'chalk';
import readline from 'readline';

class LibConnection {
    constructor() {
        // Configuración para leer entradas por consola
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    // Método principal que tu código llama
    async connect() {
        // Mostrar título grande y llamativo tal como pediste
        console.log(chalk.blue.bold(`
╔═════════════════════════════════════════════════╗
║                                                 ║
║              CONEXIÓN ULTRABOT                  ║
║                                                 ║
╚═════════════════════════════════════════════════╝
`));

        // Mostrar opciones de conexión
        console.log(chalk.magenta.bold('\n¿Cómo quieres conectarte? Elige una opción:\n'));
        console.log(chalk.yellow('1️⃣  qr → Escaneando código con tu celular'));
        console.log(chalk.yellow('2️⃣  codigo → Usando código de 8 dígitos\n'));

        // Retornamos una promesa para que funcione correctamente con tu código
        return new Promise((resolver, rechazar) => {
            this.rl.question(chalk.white('Escribe tu elección: '), async (respuesta) => {
                const opcion = respuesta.trim().toLowerCase();

                // 🟢 Opción: Código QR
                if (opcion === 'qr' || opcion === '1') {
                    console.log(chalk.green('\n👉 Modo seleccionado: Código QR'));
                    try {
                        const cliente = await this.iniciarProceso('qr');
                        resolver(cliente);
                    } catch (error) {
                        rechazar(error);
                    }
                }

                // 🟢 Opción: Código de 8 dígitos
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

                // 🔴 Opción inválida
                else {
                    console.log(chalk.red('⚠️ Opción no reconocida. Reinicia y elige entre las opciones disponibles'));
                    this.rl.close();
                    rechazar(new Error('Opción de conexión no válida'));
                }
            });
        });
    }

    // Lógica interna de conexión
    async iniciarProceso(modo, numeroUsuario = null) {
        const { state, saveCreds } = await useMultiFileAuthState('./sesion');

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: modo === 'qr',
            syncFullHistory: false
        });

        // Guardar cambios en los datos de sesión
        sock.ev.on('creds.update', saveCreds);

        // Control de estados y mensajes en consola
        sock.ev.on('connection.update', (actualizacion) => {
            const { connection, qr, code, error } = actualizacion;

            if (connection === 'open') {
                console.log(chalk.green.bold('✅ ¡CONECTADO CORRECTAMENTE A WHATSAPP!'));
                console.log(chalk.gray('→ Ya puedes usar todas las funciones del bot\n'));
                // Cerramos la entrada de datos ya que ya se conectó
                this.rl.close();
            }

            if (connection === 'close') {
                if (error) console.log(chalk.red(`❌ Conexión cerrada → Motivo: ${error.message || 'Desconocido'}`));
            }

            // Mostrar código QR
            if (modo === 'qr' && qr) {
                console.log(chalk.yellow.bold('\n📲 ESCANEA ESTE CÓDIGO QR:'));
                console.log(chalk.gray('→ Abre WhatsApp > Dispositivos vinculados > Vincular un dispositivo\n'));
            }

            // Mostrar código de 8 dígitos
            if (modo === 'codigo' && code) {
                console.log(chalk.cyan.bold(`\n🔑 TU CÓDIGO DE VINCULACIÓN ES: ${code}`));
                console.log(chalk.gray(`→ Para el número: ${numeroUsuario}`));
                console.log(chalk.gray('→ Ingresa este código en tu aplicación de WhatsApp\n'));
            }
        });

        // Generar código de vinculación cuando se elige esa opción
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

// Exportamos la clase tal como tu código lo necesita
export default LibConnection;
