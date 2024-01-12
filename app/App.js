import React, { useState, useEffect } from 'react';
import { StatusBar, View, Text, StyleSheet, ScrollView, Modal, Alert } from 'react-native';
import { Button, Switch, List, IconButton } from 'react-native-paper';
import moment from 'moment';
import BleManager from 'react-native-ble-manager';
import DatePicker from 'react-native-date-picker';


export default function App() {

  const [newAlarmTime, setNewAlarmTime] = useState(new Date());
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [device, setDevice] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [alarms, setAlarms] = useState([]);
  const [currentTime, setCurrentTime] = useState(moment().format('HH:mm'));
  const SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
  const TX_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E';
  const RX_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E';

  const toggleModal = () => {
    if(alarms.length < 5) {
      setIsModalVisible(!isModalVisible);
    } else {
      Alert.alert(
        'Límite máximo',
        'Solo se pueden crear máximo 5 alarmas.'
      );
    }
  };

  const stringToBytes = (string) => {
      const array = new Uint8Array(string.length);
      for (let i = 0, l = string.length; i < l; i++) {
        array[i] = string.charCodeAt(i);
      }
      return Array.from(array);
  };

  const bytesToString = (bytes) => {
      return String.fromCharCode.apply(null, new Uint8Array(bytes));
  };


  useEffect(() => {
    // Actualiza la hora cada segundo
    const intervalId = setInterval(() => {
      setCurrentTime(moment().format('HH:mm'));
    }, 1000);

    // Limpia el intervalo al desmontar el componente
    return () => clearInterval(intervalId);
  }, []);

  const addAlarm = () => {
    // Añadir una nueva alarma a la lista con una hora predeterminada y activada.
    const newAlarm = { id: Date.now(), time: moment(newAlarmTime).format('HH:mm'), enabled: true };
    console.log(newAlarm);
    setAlarms((prevAlarms) => [...prevAlarms, newAlarm]);
  };

  const toggleSwitch = (id) => {
    // Cambiar el estado de activación de una alarma específica.
    setAlarms((prevAlarms) =>
      prevAlarms.map((alarm) => {

        if(alarm.id == id) { 
            return {...alarm, enabled: !alarm.enabled } 
        } else {
            return alarm
        }

      }
      )
    );
  };

  const deleteAlarm = (id) => {
    // Eliminar una alarma específica de la lista.
    setAlarms((prevAlarms) => prevAlarms.filter((alarm) => alarm.id != id));
  };

  const saveAlarms = () => {
    // Guardar las alarmas.
    console.log('Alarms Saved:', alarms);
    
    const message = JSON.stringify(alarms) + ' '
    // Define el tamaño del fragmento
    const chunkSize = 19;

    // Divide la cadena en fragmentos
    const chunks = [];
    for (let i = 0; i < message.length; i += chunkSize) {
      chunks.push(message.substring(i, i + chunkSize) + ' ');
    }

    // Envia cada fragmento por separado
    for (const chunk of chunks) {
      sendMessage(device, chunk);
    }

  };

  const scanDevices = async () => {
    if(isConnected){
      // Lo desconecto
      BleManager.disconnect(device.id)
      .then(() => {
        console.log('Dispositivo desconectado');
        setIsConnected(false);
      })
      .catch((error) => {
        console.log('Error al desconectar el dispositivo:', error);
      });
      return
    }
    BleManager.checkState()
      .then((currentState) => {
        if (currentState === 'on') {
          BleManager.start({ showAlert: false })
            .then(() => {
              console.log('Módulo inicializado');
            })
            .catch((error) => {
              console.log('Error al inicializar el módulo:', error);
            });

          setScanning(true);

          BleManager.scan([], 5, true)
            .then(() => {
              console.log('Escaneo iniciado...');
              setTimeout(() => {
                BleManager.getDiscoveredPeripherals()
                  .then(async (devicesArray) => {
                    const esp32 = devicesArray.find((device) => device.id == '0C:B8:15:CB:F5:5A')
                    setDevice(esp32);
                    connectDevice(esp32)

                  })
                  .catch((error) => {
                    console.log('Error al obtener dispositivos:', error);
                    setScanning(false);
                  });
              }, 5000);
            })
            .catch((error) => {
              console.log('Error al iniciar el escaneo:', error);
              setScanning(false);
            });
        } else {
          Alert.alert(
            'Bluetooth apagado',
            'Por favor, active el Bluetooth para buscar dispositivos.'
          );
        }
      })
      .catch((error) => {
        console.log('Error al verificar el estado del Bluetooth:', error);
      });
  };

  const connectDevice = async (peripheral) => {
    BleManager.connect(peripheral.id)
      .then(async () => {
        console.log('Dispositivo conectado:', peripheral.name);
        setIsConnected(true);
        setScanning(false);

        // Obtengo las alarmas guardadas
        BleManager.requestMTU(peripheral.id, 512);
        //scanDevices()
        sendMessage(peripheral, "get-alarms ")
        // Suscribirse a las notificaciones de la característica relevante
        BleManager.startNotification(peripheral.id, SERVICE_UUID, RX_UUID)
        .then(() => {
          console.log('Suscripción a notificaciones iniciada');
        })
        .catch((error) => {
          console.log('Error al iniciar la suscripción a notificaciones:', error);
        });
        //console.log('holi');
        // Configurar un listener para manejar los datos recibidos
        let receivedData = ''
        BleManager.addListener('BleManagerDidUpdateValueForCharacteristic', (data, err) => {
          if (err) {
            console.log('Error al recibir datos:', err);
          } else {
            const receivedText = bytesToString(data.value);
            receivedData = receivedData + receivedText;
            if (receivedData[receivedData.length - 1] == ']') {
                // Datos recibidos
                console.log(receivedData);
                const alarms = JSON.parse(receivedData)
                setAlarms(alarms);
            }
          }
        });

      })
      .catch((error) => {
        console.log('Error al conectar el dispositivo:', error);
        setIsConnected(false);
      });
  };

  const sendMessage = async (device, message) => {

    BleManager.write(
      device.id,
      SERVICE_UUID,
      TX_UUID,
      stringToBytes(message)
    )
      .then(() => {
        console.log('Mensaje enviado:', message);
      })
      .catch((error) => {
        console.log('Error al enviar el mensaje:', error);
      });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.time}>{currentTime}</Text>

      <Text style={{color: isConnected ? '#27AE60' : 'grey', fontSize: 12, textAlign: 'center', margin: 5}}>Dispositivo {isConnected ? 'conectado' : 'desconectado'}</Text>
      
      <Button
        style={styles.connectButton}
        mode="contained"
        onPress={scanDevices}
        textColor="#2C3E50"
        buttonColor="#FFFFFF"
        labelStyle={{ fontSize: 20, fontWeight: 'bold' }}
      >
        {scanning ? 'Conectando...' : (isConnected ? 'Desconectar' : 'Conectar')}
      </Button>


      <Button
        style={styles.button}
        mode="contained"
        onPress={toggleModal}
        textColor="#2C3E50"
        buttonColor="#FFFFFF"
        labelStyle={{ fontSize: 20, fontWeight: 'bold' }}
        disabled={!isConnected}
      >
        Agregar alarma
      </Button>

      <Modal
        visible={isModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={toggleModal}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <DatePicker fadeToColor='#fff' style={styles.datePicker} textColor='#2C3E50' mode='time' date={newAlarmTime} onDateChange={setNewAlarmTime} />
            <Button
              mode="contained"
              onPress={() => {
                addAlarm()
                toggleModal();
              }}
              style={{borderRadius: 10, margin: 5}}
              buttonColor="#2C3E50"
            >
              Guardar Alarma
            </Button>
            <Button
              mode="contained"
              buttonColor="#D72638"
              style={{borderRadius: 10, margin: 5}}
              onPress={() => {
                toggleModal();
              }}
            >
              Cancelar
            </Button>
          </View>
        </View>
      </Modal>

      <ScrollView>

        <List.Section style={styles.listSection}>
          <List.Subheader style={styles.subheader}>Alarmas</List.Subheader>
          {alarms.length > 0 ? (alarms.map((alarm, index) => (
            <List.Item
              style={styles.itemStyle}
              titleStyle={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}
              key={index}
              title={alarm.time}
              right={() => (
                <View style={styles.rightContainer}>
                  <Switch
                    value={alarm.enabled}
                    onValueChange={() => toggleSwitch(alarm.id)}
                    color="#27AE60"
                  />
                  <IconButton
                    icon="delete"
                    iconColor="red"
                    size={30}
                    style={{margin: 0, marginLeft: 10, padding: 0}}
                    onPress={() => deleteAlarm(alarm.id)}
                  />
                </View>
              )}
            />
          )) ) : <Text style={{ color: 'grey', textAlign: 'center', margin: 10 }} >No hay alarmas</Text>}
        </List.Section>
      </ScrollView>

      <Button
        style={styles.buttonSave}
        mode="contained"
        onPress={saveAlarms}
        textColor="#2C3E50"
        buttonColor="#FFFFFF"
        labelStyle={{ fontSize: 20, fontWeight: 'bold' }}
      >
        Guardar
      </Button>
      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    height: '100%',
    display: "flex",
    alignContent: "center",
    alignItems: "stretch",
    backgroundColor: "#2C3E50"
  },
  time: {
    fontSize: 60,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
    color: '#fff',
  },
  button: {
    marginVertical: 8,
    borderRadius: 10,
    padding: 5
  },
  listSection: {
    marginBottom: 60,
  },
  subheader: {
    color: '#fff',
  },
  buttonSave: {
    position: 'absolute',
    bottom: 0,
    margin: 10,
    width: '100%',
    alignSelf: 'center',
    borderRadius: 10,
    padding: 5
  },
  itemStyle: {
    backgroundColor: "rgba(255, 255, 255, 0.19)",
    margin: 10,
    borderRadius: 10,
    borderColor: "#fff",
    borderWidth: 1
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectButton: {
    marginVertical: 8,
    borderRadius: 10,
    padding: 5,
  },
  connectedText: {
    color: '#27AE60',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)'
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    elevation: 5,
    width: '80%',
  },
  input: {
    marginBottom: 10,
  },
  datePicker: {
    margin: 0,
    padding: 0,
    alignSelf: 'center'
  }
});
