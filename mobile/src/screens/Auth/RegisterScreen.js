import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useDispatch, useSelector } from 'react-redux';
import { register, clearError } from '../../store/slices/authSlice';
import apiService from '../../services/api/ApiService';

const RegisterScreen = ({ navigation }) => {
  const dispatch = useDispatch();
  const { isLoading, error } = useSelector((state) => state.auth);

  const [optionsLoading, setOptionsLoading] = useState(true);
  const [agencies, setAgencies] = useState([]);
  const [roles, setRoles] = useState(['Field_Worker', 'Supervisor', 'Viewer']);
  const [form, setForm] = useState({
    employeeName: '',
    employeeContact: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    agencyId: '',
    role: 'Field_Worker'
  });

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const response = await apiService.get('/auth/register/options');
        if (response.data?.success) {
          setAgencies(response.data.data?.agencies || []);
          setRoles(response.data.data?.roles || ['Field_Worker', 'Supervisor', 'Viewer']);
        }
      } catch (err) {
        Alert.alert('Error', 'Failed to load registration options');
      } finally {
        setOptionsLoading(false);
      }
    };

    loadOptions();
  }, []);

  useEffect(() => {
    if (error) {
      Alert.alert('Registration Failed', String(error));
      dispatch(clearError());
    }
  }, [error, dispatch]);

  const setField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleRegister = async () => {
    if (!form.employeeName.trim() || !form.username.trim() || !form.password.trim() || !form.agencyId) {
      Alert.alert('Validation Error', 'Name, username, password, and agency are required');
      return;
    }

    if (form.password.length < 8) {
      Alert.alert('Validation Error', 'Password must be at least 8 characters');
      return;
    }

    if (form.password !== form.confirmPassword) {
      Alert.alert('Validation Error', 'Passwords do not match');
      return;
    }

    try {
      await dispatch(register({
        username: form.username.trim(),
        password: form.password,
        employeeName: form.employeeName.trim(),
        employeeContact: form.employeeContact.trim(),
        email: form.email.trim(),
        role: form.role,
        agencyId: Number(form.agencyId)
      })).unwrap();
    } catch (err) {
      // handled by slice
    }
  };

  if (optionsLoading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading registration options...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.formContainer}>
          <Text style={styles.title}>Create Account</Text>

          <TextInput style={styles.input} placeholder="Full Name" placeholderTextColor="#666" value={form.employeeName} onChangeText={(v) => setField('employeeName', v)} />
          <TextInput style={styles.input} placeholder="Phone" placeholderTextColor="#666" value={form.employeeContact} onChangeText={(v) => setField('employeeContact', v)} keyboardType="phone-pad" />
          <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#666" value={form.email} onChangeText={(v) => setField('email', v)} autoCapitalize="none" keyboardType="email-address" />
          <TextInput style={styles.input} placeholder="Username" placeholderTextColor="#666" value={form.username} onChangeText={(v) => setField('username', v)} autoCapitalize="none" />
          <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#666" value={form.password} onChangeText={(v) => setField('password', v)} secureTextEntry />
          <TextInput style={styles.input} placeholder="Confirm Password" placeholderTextColor="#666" value={form.confirmPassword} onChangeText={(v) => setField('confirmPassword', v)} secureTextEntry />

          <View style={styles.pickerWrap}>
            <Text style={styles.pickerLabel}>Agency</Text>
            <Picker
              selectedValue={form.agencyId}
              onValueChange={(value) => setField('agencyId', value)}
              style={styles.picker}
              dropdownIconColor="#FFD100"
            >
              <Picker.Item label="Select agency..." value="" />
              {agencies.map((agency) => (
                <Picker.Item
                  key={agency.Agency_ID}
                  label={`${agency.Agency_Name} (${agency.Agency_CD})`}
                  value={String(agency.Agency_ID)}
                />
              ))}
            </Picker>
          </View>

          <View style={styles.pickerWrap}>
            <Text style={styles.pickerLabel}>Role</Text>
            <Picker
              selectedValue={form.role}
              onValueChange={(value) => setField('role', value)}
              style={styles.picker}
              dropdownIconColor="#FFD100"
            >
              {roles.map((role) => (
                <Picker.Item key={role} label={role} value={role} />
              ))}
            </Picker>
          </View>

          <TouchableOpacity style={[styles.button, isLoading ? styles.buttonDisabled : null]} onPress={handleRegister} disabled={Boolean(isLoading)}>
            <Text style={styles.buttonText}>{isLoading ? 'Creating...' : 'Create Account'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkButton} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.linkText}>Already have an account? Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000'
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20
  },
  formContainer: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    padding: 20
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 20
  },
  input: {
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 8,
    color: '#FFFFFF',
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  pickerWrap: {
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333333',
    backgroundColor: '#2A2A2A'
  },
  pickerLabel: {
    color: '#CCCCCC',
    fontSize: 12,
    paddingTop: 8,
    paddingHorizontal: 12
  },
  picker: {
    color: '#FFFFFF'
  },
  button: {
    backgroundColor: '#FFD100',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8
  },
  buttonDisabled: {
    opacity: 0.6
  },
  buttonText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 16
  },
  linkButton: {
    marginTop: 14,
    alignItems: 'center'
  },
  linkText: {
    color: '#FFD100'
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000'
  },
  loadingText: {
    color: '#FFFFFF'
  }
});

export default RegisterScreen;
