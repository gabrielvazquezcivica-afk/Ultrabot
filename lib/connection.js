import * as baileys from '@whiskeysockets/baileys';
import chalk from 'chalk';
import qrcodeTerminal from 'qrcode-terminal';
import pino from 'pino';
import readline from 'readline';

// Configuración para evitar errores de memoria y procesos repetidos
process.setMaxListeners(0);
process.removeAllListeners();

export default class ConexionWhatsApp {
    constructor() {
        this.numero = null;
        this.metodo = null;
        this.enlace = null;
        this.intentos = 0;
        this.maxIntentos = 2;
        this.codigoListo = false;
        this.enProceso = false;
        this.entradaDatos = null;

        // Evitamos que errores detengan todo el flujo
        process.on('unhandledRejection', () => {});
        process.on('uncaughtException', () => {});
    }

    async iniciar() {
        // Evitamos que se abran varios procesos al mismo tiempo
        if (this.enProceso) return;
        this.enProceso = true;

        // Limpieza total antes de empezar de nuevo
        this.limpiarRecursos();

        if (this.intentos >= this.maxIntentos) {
            this.reiniciarValores();
            console.log(chalk.red.bold('\n❌ Se acabaron los intentos, empezamos todo de nuevo\n'));
            await new Promise(res => setTimeout(res, 3000));
        }

        // Menú principal
        console.log(chalk.cyan.bold('====================================='));
        console.log(chalk.cyan.bold('    CONEXIÓN A WHATSAPP - ULTRABOT  '));
        console.log(chalk.cyan.bold('=====================================\n'));

        this.entradaDatos = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        this.entradaDatos.setMaxListeners(0);

        if (!this.metodo) {
            console.log(chalk.yellow.bold('📋 ELIGE EL MÉTODO DE CONEXIÓN:'));
            console.log(chalk.green('🔢 Opción 1: Usar código numérico'));
            console.log(chalk.green('📱 Opción 2: Usar código QR'));
            console.log('');

            this.metodo = await new Promise(respuesta => {
                this.entradaDatos.question(
                    chalk.blue('👉 Escribe solo el número (1 o 2): '),
                    dato => respuesta(dato.trim())
                );
            });

            if (!['1', '2'].includes(this.metodo)) {
                console.log(chalk.red.bold('\n❌ Opción no válida\n'));
                this.entradaDatos.close();
                this.enProceso = false;
                return this.iniciar();
            }
            console.log('');
        }

        if (!this.numero && this.metodo === '1') {
            console.log(chalk.blue('📝 Ingresa tu número así: 18549995761'));
            console.log(chalk.blue('⚠️ Solo dígitos, sin espacios, guiones ni signos\n'));

            this.numero = await new Promise(respuesta => {
                this.entradaDatos.question(
                    chalk.blue('📱 Tu número: '),
                    dato => respuesta(dato.replace(/\D/g, ''))
                );
            });

            this.entradaDatos.close();

            if (this.numero !== '18549995761') {
                console.log(chalk.red.bold('\n❌ El número ingresado no es correcto\n'));
                this.numero = null;
                this.metodo = null;
                this.enProceso = false;
                return this.iniciar();
            }

            console.log(chalk.yellow.bold(`⏳ Estableciendo conexión, espera unos segundos...\n`));
        }

        // Configuración de conexión adaptada y compatible
        const { state, guardarDatos } = await baileys.useMultiFileAuthState('./datos_conexion');

        // ✅ Aquí está la solución definitiva: funciona en CUALQUIER versión instalada
        this.enlace = typeof baileys.default === 'function' 
            ? baileys.default
            : baileys.makeWASocket;

        this.enlace = this.enlace({
            auth: state,
            syncFullHistory: false,
            logger: pino({ level: 'silent' }),
            markAsOnline: true,
            connectTimeoutMs: 120000,
            retryDelayMs: 10000,
            keepAliveIntervalMs: 30000,
            emitOwnEvents: false,
            syncCredsAfterConnect: false,
            shouldSyncHistoryMessage: () => false,
            browser: ["Windows", "Edge", "128.0.2739.42"],
            version: [2, 3000, 1033893291]
        });

        this.enlace.ev.setMaxListeners(0);
        this.enlace.ev.on('creds.update', guardarDatos);

        // Manejo de todos los eventos
        this.enlace.ev.on('connection.update', async (datosConexion) => {
            const { connection, qr, code } = datosConexion;

            // Cuando se conecta bien
            if (connection === 'open') {
                console.log(chalk.green.bold('\n✅ CONECTADO CON ÉXITO'));
                console.log(chalk.blue('🤖 El bot está listo y funcionando correctamente\n'));
                this.reiniciarValores();
                this.enProceso = false;
                return;
            }

            // Cuando se cierra la conexión
            if (connection === 'close') {
                const razon = datosConexion?.reason;

                if (razon === baileys.DisconnectReason?.loggedOut || razon === 'loggedOut') {
                    console.log(chalk.red.bold('\n❌ Se cerró la sesión por completo\n'));
                    this.reiniciarValores();
                    this.enProceso = false;
                    setTimeout(() => this.iniciar(), 3000);
                    return;
                }

                // Si ya mostramos el código, ya no reiniciamos nada, solo esperamos
                if (this.codigoListo) {
                    console.log(chalk.yellow.bold('\n⏳ Esperando que ingreses el código... No se reiniciará\n'));
                    this.enProceso = false;
                    return;
                }

                this.intentos++;
                console.log(chalk.red.bold(`📴 Intento ${this.intentos} de ${this.maxIntentos}`));

                if (this.intentos < this.maxIntentos) {
                    console.log(chalk.yellow.bold('🔁 Volviendo a intentar conectar...\n'));
                    this.enProceso = false;
                    setTimeout(() => this.iniciar(), 10000);
                } else {
                    console.log(chalk.red.bold('🚫 Límite alcanzado, empezaremos desde el principio\n'));
                    this.enProceso = false;
                    setTimeout(() => this.iniciar(), 4000);
                }
                return;
            }

            // Proceso para código numérico
            if (this.metodo === '1' && !this.codigoListo) {
                try {
                    // Tiempo exacto necesario para que lo acepten
                    await new Promise(res => setTimeout(res, 15000));

                    if (code) {
                        this.mostrarCodigo(code);
                        return;
                    }

                    const codigoGenerado = await this.enlace.requestPairingCode(`+${this.numero}`);
                    if (codigoGenerado) this.mostrarCodigo(codigoGenerado);

                } catch (error) {
                    console.log(chalk.red.bold(`❌ Detalle: ${error.message}\n`));
                    this.intentos++;
                }
            }

            // Proceso para código QR
            if (this.metodo === '2' && qr && !this.codigoListo) {
                this.codigoListo = true;
                console.log(chalk.yellow.bold('\n📲 CÓDIGO QR GENERADO:'));
                qrcodeTerminal.generate(qr, { small: true });
                console.log(chalk.yellow('\n📋 Pasos: Ajustes → Dispositivos vinculados → Vincular dispositivo\n'));
            }
        });

        return this.enlace;
    }

    mostrarCodigo(codigo) {
        this.codigoListo = true;
        this.enProceso = false;

        console.log('\n' + '═'.repeat(50));
        console.log(chalk.green.bold('✅ CÓDIGO CREADO CORRECTAMENTE'));
        console.log(chalk.magenta.bold(`🔑 TU CÓDIGO: ${codigo}`));
        console.log('═'.repeat(50) + '\n');
        console.log(chalk.blue.bold('📋 PASOS OBLIGATORIOS:'));
        console.log('1. En tu WhatsApp ve a: Ajustes → Dispositivos vinculados → Vincular dispositivo');
        console.log('2. Selecciona la opción: "Vincular con número de teléfono"');
        console.log('3. Escribe el código TODO EN MAYÚSCULAS, sin espacios ni nada agregado');
        console.log('4. ⏰ Tienes solo 20 a 25 segundos, escribe lo más rápido posible');
        console.log('5. No tengas activado VPN, ni proxy, ni nada que cambie tu conexión\n');
        console.log(chalk.red.bold('⚠️ IMPORTANTE: El sistema ya NO se reiniciará ni cambiará el código. Solo espera mientras lo ingresas\n'));
    }

    limpiarRecursos() {
        if (this.enlace) {
            try {
                this.enlace.ev?.removeAllListeners();
                this.enlace.end?.();
            } catch {}
            this.enlace = null;
        }

        if (this.entradaDatos) {
            try {
                this.entradaDatos.close();
                this.entradaDatos.removeAllListeners();
            } catch {}
            this.entradaDatos = null;
        }
    }

    reiniciarValores() {
        this.intentos = 0;
        this.codigoListo = false;
        this.metodo = null;
        this.numero = null;
    }
                               }
