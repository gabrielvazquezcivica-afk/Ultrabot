import { default as makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
import chalk from 'chalk';
import readline from 'readline';

// Interfaz para interactuar con la consola
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Mostrar título grande y llamativo
console.log(chalk.blue.bold(`
╔═════════════════════════════════════════╗
║                                         ║
║            CONEXIÓN ULTRABOT            ║
║                                         ║
╚═════════════════════════════════════════╝
`));

// Función principal de conexión
async function iniciarConexion(modo, numeroUsuario) {
    const { state, saveCreds } = await useMultiFileAuthState('./sesion');
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: modo === 'qr'
    });

    // Guardar credenciales cuando cambien
    sock.ev.on('creds.update', saveCreds);

    // Manejar evento de conexión
    sock.ev.on('connection.update', (update) => {
        const { connection, qr, code } = update;

        if (connection === 'open') {
            console.log(chalk.green('✅ ¡Conectado exitosamente a WhatsApp!'));
        }

        if (modo === 'qr' && qr) {
            console.log(chalk.yellow('📲 Escanea este código QR con tu aplicación de WhatsApp:'));
        }

        if (modo === 'codigo' && code) {
            console.log(chalk.cyan(`🔑 Tu código de 8 dígitos para el número ${numeroUsuario} es: ${chalk.bold(code)}`));
        }

        if (connection === 'close') {
            console.log(chalk.red('❌ La conexión se cerró, intentando reconectar...'));
        }
    });

    // Si es por código, solicitar el enlace con el número
    if (modo === 'codigo') {
        try {
            await sock.requestPairingCode(numeroUsuario);
        } catch (err) {
            console.log(chalk.red('⚠️ Ocurrió un error al generar el código: ' + err.message));
            rl.close();
        }
    }
}

// Mostrar opciones al usuario
console.log(chalk.magenta.bold('\n¿Cómo quieres conectarte? Elige una opción:\n'));
console.log(chalk.yellow('1️⃣  qr → Escaneando código con tu celular'));
console.log(chalk.yellow('2️⃣  codigo → Usando código de 8 dígitos\n'));

rl.question(chalk.white('Escribe tu elección: '), (respuesta) => {
    const opcion = respuesta.trim().toLowerCase();

    if (opcion === 'qr' || opcion === '1') {
        console.log(chalk.green('\n👉 Modo seleccionado: Código QR'));
        iniciarConexion('qr');
    } 
    else if (opcion === 'codigo' || opcion === '2') {
        console.log(chalk.green('\n👉 Modo seleccionado: Código de 8 dígitos'));
        console.log(chalk.cyan('📌 Ejemplo de cómo ingresar tu número: 523331234567 (código de país + número sin ceros iniciales)'));
        
        rl.question(chalk.white('Ingresa tu número: '), (numero) => {
            const numeroLimpio = numero.trim();
            if (/^\d+$/.test(numeroLimpio)) {
                iniciarConexion('codigo', numeroLimpio);
            } else {
                console.log(chalk.red('⚠️ El número solo debe contener dígitos, intenta nuevamente.'));
                rl.close();
            }
        });
    } 
    else {
        console.log(chalk.red('⚠️ Opción no válida, por favor reinicia y elige entre las opciones indicadas.'));
        rl.close();
    }
});
  
