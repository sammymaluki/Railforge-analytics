import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  TextInput,
} from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import DropDownPicker from 'react-native-dropdown-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { createAuthority, getActiveAuthority } from '../../store/slices/authoritySlice';
import databaseService from '../../services/database/DatabaseService';
import apiService from '../../services/api/ApiService';
import navigationService from '../../navigation/NavigationService';
import gpsTrackingService from '../../services/gps/GPSTrackingService';

const authoritySchema = yup.object().shape({
  authorityType: yup.string().required('Authority type is required'),
  subdivisionId: yup.number().required('Subdivision is required'),
  beginMP: yup.number()
    .typeError('Begin milepost must be a number')
    .required('Begin milepost is required')
    .positive('Begin milepost must be positive'),
  endMP: yup.number()
    .typeError('End milepost must be a number')
    .required('End milepost is required')
    .positive('End milepost must be positive')
    .min(yup.ref('beginMP'), 'End milepost must be greater than or equal to begin milepost'),
  trackType: yup.string().required('Track type is required'),
  trackNumber: yup.string().required('Track number is required'),
  employeeNameDisplay: yup.string(),
  employeeContactDisplay: yup.string(),
  expirationTime: yup.date().nullable(),
});

const AuthorityFormScreen = ({ navigation, route }) => {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const authorityState = useSelector((state) => state.authority);
  const isCreating = Boolean(authorityState.isCreating);
  const error = authorityState.error;
  const agencyId = user?.Agency_ID ?? user?.agency_id ?? user?.agencyId;

  const [subdivisions, setSubdivisions] = useState([]);
  const [trackNumbers, setTrackNumbers] = useState([]);
  const [showExpirationPicker, setShowExpirationPicker] = useState(false);
  const [expirationDate, setExpirationDate] = useState(new Date());
  const [expirationInput, setExpirationInput] = useState('');
  
  // Dropdown states
  const [authorityTypeOpen, setAuthorityTypeOpen] = useState(false);
  const [subdivisionOpen, setSubdivisionOpen] = useState(false);
  const [trackTypeOpen, setTrackTypeOpen] = useState(false);
  const [trackNumberOpen, setTrackNumberOpen] = useState(false);
  
  const authorityTypes = [
    { label: 'Track Authority', value: 'Track_Authority' },
    { label: 'Lone Worker Authority', value: 'Lone_Worker_Authority' },
  ];

  const trackTypes = [
    { label: 'Main', value: 'Main' },
    { label: 'Yard', value: 'Yard' },
    { label: 'Siding', value: 'Siding' },
    { label: 'Storage', value: 'Storage' },
    { label: 'X_Over', value: 'X_Over' },
    { label: 'Other', value: 'Other' },
  ];

  const {
    control,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm({
    resolver: yupResolver(authoritySchema),
    defaultValues: {
      authorityType: 'Track_Authority',
      employeeNameDisplay: user?.Employee_Name || '',
      employeeContactDisplay: user?.Employee_Contact || '',
    },
  });

  const watchedExpirationTime = watch('expirationTime');

  useEffect(() => {
    if (!watchedExpirationTime) {
      setExpirationInput('');
      return;
    }

    const date = new Date(watchedExpirationTime);
    if (Number.isNaN(date.getTime())) {
      setExpirationInput('');
      return;
    }

    const yyyy = date.getFullYear();
    const mm = `${date.getMonth() + 1}`.padStart(2, '0');
    const dd = `${date.getDate()}`.padStart(2, '0');
    const hh = `${date.getHours()}`.padStart(2, '0');
    const min = `${date.getMinutes()}`.padStart(2, '0');
    setExpirationInput(`${yyyy}-${mm}-${dd} ${hh}:${min}`);
  }, [watchedExpirationTime]);

  // Load subdivisions from database
  useEffect(() => {
    loadSubdivisions();
  }, [agencyId]);

  // Watch subdivision selection to load track numbers
  const selectedSubdivision = watch('subdivisionId');
  useEffect(() => {
    // Clear existing track selection whenever subdivision changes
    setValue('trackNumber', null);

    if (selectedSubdivision && agencyId) {
      loadTrackNumbers(selectedSubdivision);
    } else {
      setTrackNumbers([]);
    }
  }, [selectedSubdivision, agencyId, setValue]);

  useEffect(() => {
    if (error) {
      Alert.alert('Error', error);
    }
  }, [error]);

  const loadSubdivisions = async () => {
    if (!agencyId) {
      console.warn('Cannot load subdivisions: missing agency ID on user object');
      setSubdivisions([]);
      return;
    }

    try {
      // Fetch subdivisions from backend API
      const response = await apiService.getAgencySubdivisions(agencyId);
      
      console.log('Subdivision API response:', response);
      
      if (response.success && response.data) {
        const subdivisionOptions = response.data
          .map((sub) => {
            const subdivisionId = sub.Subdivision_ID ?? sub.subdivision_id;
            const subdivisionCode = sub.Subdivision_Code ?? sub.subdivision_code ?? '';
            const subdivisionName = sub.Subdivision_Name ?? sub.subdivision_name ?? '';
            const parsedId = Number(subdivisionId);

            if (!Number.isFinite(parsedId)) return null;

            return {
              label: `${subdivisionCode} - ${subdivisionName}`.trim(),
              value: parsedId,
            };
          })
          .filter(Boolean);
        
        if (subdivisionOptions.length === 0) {
          console.log(`No subdivisions returned for agency ${agencyId}`);
        }
        
        setSubdivisions(subdivisionOptions);
        console.log('Loaded', subdivisionOptions.length, 'subdivisions from API');
      } else {
        throw new Error('Invalid API response');
      }
    } catch (error) {
      console.error('Failed to load subdivisions from API:', error);
      setSubdivisions([]);
    }
  };

  const loadTrackNumbers = async (subdivisionId) => {
    if (!agencyId || !subdivisionId) {
      setTrackNumbers([]);
      return;
    }

    try {
      const response = await apiService.getSubdivisionTracks(agencyId, subdivisionId);
      
      console.log('Track numbers API response:', response);
      
      if (response.success && response.data) {
        const trackNumberOptions = response.data
          .map((track) => {
            const trackType = track.Track_Type ?? track.track_type;
            const trackNumber = track.Track_Number ?? track.track_number;
            if (!trackType || !trackNumber) return null;

            return {
              label: `${trackType} - ${trackNumber}`,
              value: `${trackType}-${trackNumber}`, // Make unique by combining both
            };
          })
          .filter(Boolean);
        
        setTrackNumbers(trackNumberOptions);
        console.log('Loaded', trackNumberOptions.length, 'track numbers from API');
      } else {
        setTrackNumbers([]);
      }
    } catch (error) {
      if (error?.status === 404) {
        console.warn('No tracks found for selected subdivision under this agency');
      }
      console.error('Failed to load track numbers from API:', error);
      setTrackNumbers([]);
    }
  };

  const handleExpirationDateChange = (event, selectedDate) => {
    if (event.type === 'dismissed') {
      if (Platform.OS === 'ios') {
        setShowExpirationPicker(false);
      }
      return;
    }
    
    if (selectedDate) {
      setExpirationDate(selectedDate);
      setValue('expirationTime', selectedDate);
    }
    
    if (Platform.OS === 'ios') {
      setShowExpirationPicker(false);
    }
  };

  const showExpirationDatePicker = () => {
    if (Platform.OS === 'android') {
      // Use imperative API for Android to avoid unmount issues
      DateTimePickerAndroid.open({
        value: expirationDate,
        mode: 'date',
        is24Hour: false,
        onChange: (event, selectedDate) => {
          if (event.type === 'dismissed') return;
          
          if (selectedDate) {
            setExpirationDate(selectedDate);
            setValue('expirationTime', selectedDate);
          }
        },
      });
    } else {
      // Use component-based approach for iOS
      setShowExpirationPicker(true);
    }
  };

  const clearExpirationDate = () => {
    setExpirationDate(new Date());
    setValue('expirationTime', null);
    setExpirationInput('');
  };

  const applyManualExpirationValue = () => {
    const trimmed = expirationInput.trim();
    if (!trimmed) {
      setValue('expirationTime', null);
      return;
    }

    const normalized = trimmed.replace('T', ' ');
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      Alert.alert('Invalid Date', 'Use format: YYYY-MM-DD HH:mm');
      return;
    }

    if (parsed < new Date()) {
      Alert.alert('Invalid Date', 'Expiration must be in the future.');
      return;
    }

    setExpirationDate(parsed);
    setValue('expirationTime', parsed);
  };

  const onSubmit = async (data) => {
    try {
      // Parse the combined track number value (format: "TrackType-TrackNumber")
      let trackNumber = data.trackNumber;
      if (trackNumber && trackNumber.includes('-')) {
        // Extract just the track number part after the dash
        trackNumber = trackNumber.split('-').slice(1).join('-'); // Handle cases like "Main-1-2"
      }

      let normalizedExpirationTime;
      if (data.expirationTime !== null && data.expirationTime !== undefined && data.expirationTime !== '') {
        const parsedExpiration = new Date(data.expirationTime);
        if (!Number.isNaN(parsedExpiration.getTime())) {
          normalizedExpirationTime = parsedExpiration.toISOString();
        }
      }
      
      const authorityData = {
        ...data,
        trackNumber, // Use the extracted track number
      };

      if (normalizedExpirationTime) {
        authorityData.expirationTime = normalizedExpirationTime;
      } else {
        delete authorityData.expirationTime;
      }
      
      const result = await dispatch(createAuthority(authorityData)).unwrap();
      
      // Fetch the active authority to update the state
      const activeAuthority = await dispatch(getActiveAuthority()).unwrap();
      
      // Start GPS tracking for the new authority
      if (activeAuthority) {
        try {
          await gpsTrackingService.init();
          await gpsTrackingService.startTracking(activeAuthority);
          console.log('GPS tracking started for authority:', activeAuthority.Authority_ID);
        } catch (error) {
          console.error('Failed to start GPS tracking:', error);
          Alert.alert(
            'GPS Tracking',
            'Could not start GPS tracking. Location services may not be available.',
            [{ text: 'OK' }]
          );
        }
      }
      
      if (result.hasOverlap && result.overlapDetails.length > 0) {
        Alert.alert(
          'Authority Created with Overlap',
          `Your authority overlaps with ${result.overlapDetails.length} other worker(s). Alerts have been sent.`,
          [
            {
              text: 'View Details',
              onPress: () => {
                navigationService.navigateToMapWithAuthority(result.authorityId || result.id);
              },
            },
            {
              text: 'Continue',
              onPress: () => {
                navigationService.navigateToMapWithAuthority(result.authorityId || result.id);
              },
            },
          ]
        );
      } else {
        Alert.alert(
          'Authority Created',
          'Your authority has been created successfully.',
          [
            {
              text: 'Go to Map',
              onPress: () => {
                navigationService.navigateToMapWithAuthority(result.authorityId || result.id);
              },
            },
          ]
        );
      }
      
      // Reset form
      reset();
      setExpirationDate(new Date());
    } catch (err) {
      console.error('Failed to create authority:', err);
    }
  };

  const renderFormField = (name, label, renderInput) => (
    <View style={styles.fieldContainer}>
      <Text style={styles.label}>{label}</Text>
      {renderInput}
      {errors[name] && (
        <Text style={styles.errorText}>{errors[name]?.message}</Text>
      )}
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.form}>
        {/* Authority Type */}
        {renderFormField('authorityType', 'Authority Type', (
          <Controller
            control={control}
            name="authorityType"
            render={({ field: { onChange, value } }) => (
              <DropDownPicker
                open={authorityTypeOpen}
                value={value}
                items={authorityTypes}
                setOpen={setAuthorityTypeOpen}
                setValue={(callback) => onChange(callback(value))}
                setItems={() => {}}
                style={styles.dropdown}
                dropDownContainerStyle={styles.dropdownContainer}
                textStyle={styles.dropdownText}
                placeholder="Select authority type"
                zIndex={3000}
                zIndexInverse={1000}
                listMode="SCROLLVIEW"
              />
            )}
          />
        ))}

        {/* Subdivision */}
        {renderFormField('subdivisionId', 'Subdivision', (
          <Controller
            control={control}
            name="subdivisionId"
            render={({ field: { onChange, value } }) => (
              <DropDownPicker
                open={subdivisionOpen}
                value={value}
                items={subdivisions}
                setOpen={setSubdivisionOpen}
                setValue={(callback) => onChange(callback(value))}
                setItems={() => {}}
                style={styles.dropdown}
                dropDownContainerStyle={styles.dropdownContainer}
                textStyle={styles.dropdownText}
                placeholder="Select subdivision"
                searchable={true}
                searchPlaceholder="Search subdivisions..."
                zIndex={2000}
                zIndexInverse={2000}
                listMode="SCROLLVIEW"
              />
            )}
          />
        ))}

        {/* Milepost Range */}
        <View style={styles.row}>
          <View style={[styles.fieldContainer, styles.halfWidth]}>
            {renderFormField('beginMP', 'Begin Milepost', (
              <Controller
                control={control}
                name="beginMP"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={[styles.input, errors.beginMP && styles.inputError]}
                    placeholder="e.g., 1.0"
                    value={value?.toString()}
                    onChangeText={onChange}
                    keyboardType="numeric"
                  />
                )}
              />
            ))}
          </View>
          
          <View style={[styles.fieldContainer, styles.halfWidth]}>
            {renderFormField('endMP', 'End Milepost', (
              <Controller
                control={control}
                name="endMP"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={[styles.input, errors.endMP && styles.inputError]}
                    placeholder="e.g., 7.0"
                    value={value?.toString()}
                    onChangeText={onChange}
                    keyboardType="numeric"
                  />
                )}
              />
            ))}
          </View>
        </View>

        {/* Track Type */}
        {renderFormField('trackType', 'Track Type', (
          <Controller
            control={control}
            name="trackType"
            render={({ field: { onChange, value } }) => (
              <DropDownPicker
                open={trackTypeOpen}
                value={value}
                items={trackTypes}
                setOpen={setTrackTypeOpen}
                setValue={(callback) => onChange(callback(value))}
                setItems={() => {}}
                style={styles.dropdown}
                dropDownContainerStyle={styles.dropdownContainer}
                textStyle={styles.dropdownText}
                placeholder="Select track type"
                zIndex={1000}
                zIndexInverse={3000}
                listMode="SCROLLVIEW"
              />
            )}
          />
        ))}

        {/* Track Number */}
        {renderFormField('trackNumber', 'Track Number', (
          <Controller
            control={control}
            name="trackNumber"
            render={({ field: { onChange, value } }) => (
              <DropDownPicker
                open={trackNumberOpen}
                value={value}
                items={trackNumbers}
                setOpen={setTrackNumberOpen}
                setValue={(callback) => onChange(callback(value))}
                setItems={setTrackNumbers}
                style={styles.dropdown}
                dropDownContainerStyle={styles.dropdownContainer}
                textStyle={styles.dropdownText}
                placeholder="Select track number"
                zIndex={900}
                zIndexInverse={3100}
                listMode="SCROLLVIEW"
                disabled={trackNumbers.length === 0}
              />
            )}
          />
        ))}

        {/* Display Name */}
        {renderFormField('employeeNameDisplay', 'Display Name (Optional)', (
          <Controller
            control={control}
            name="employeeNameDisplay"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={styles.input}
                placeholder="Name to show in alerts"
                value={value}
                onChangeText={onChange}
              />
            )}
          />
        ))}

        {/* Display Contact */}
        {renderFormField('employeeContactDisplay', 'Display Contact (Optional)', (
          <Controller
            control={control}
            name="employeeContactDisplay"
            render={({ field: { onChange, value } }) => (
              <TextInput
                style={styles.input}
                placeholder="Contact to show in alerts"
                value={value}
                onChangeText={onChange}
                keyboardType="phone-pad"
              />
            )}
          />
        ))}

        {/* Expiration Time */}
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Expiration Time (Optional)</Text>
          <View style={styles.expirationContainer}>
            <TouchableOpacity
              style={styles.expirationButton}
              onPress={showExpirationDatePicker}
            >
              <MaterialCommunityIcons name="calendar" size={20} color="#FFD100" />
              <Text style={styles.expirationText}>
                {watchedExpirationTime
                  ? new Date(watchedExpirationTime).toLocaleString()
                  : 'Set expiration time'}
              </Text>
            </TouchableOpacity>
            
            {watchedExpirationTime && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={clearExpirationDate}
              >
                <MaterialCommunityIcons name="close" size={20} color="#FF4444" />
              </TouchableOpacity>
            )}
          </View>
          <TextInput
            style={styles.expirationInput}
            placeholder="Or enter manually: YYYY-MM-DD HH:mm"
            placeholderTextColor="#777777"
            value={expirationInput}
            onChangeText={setExpirationInput}
            onEndEditing={applyManualExpirationValue}
            autoCapitalize="none"
          />
          
          {/* Only render DateTimePicker component on iOS */}
          {Platform.OS === 'ios' && showExpirationPicker && (
            <DateTimePicker
              value={expirationDate}
              mode="datetime"
              display="default"
              onChange={handleExpirationDateChange}
              minimumDate={new Date()}
            />
          )}
        </View>

        {/* Example Section */}
        <View style={styles.exampleContainer}>
          <Text style={styles.exampleTitle}>Example:</Text>
          <Text style={styles.exampleText}>
            Subdivision: Medlin{'\n'}
            Begin MP: 1{'\n'}
            End MP: 7{'\n'}
            Track Type: Main{'\n'}
            Track Number: 1{'\n'}
            Display Name: Ryan Medlin{'\n'}
            Display Contact: XXX-XXX-XXXX
          </Text>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, isCreating && styles.submitButtonDisabled]}
          onPress={handleSubmit(onSubmit)}
          disabled={isCreating === true}
        >
          {isCreating ? (
            <ActivityIndicator color="#000000" />
          ) : (
            <>
              <MaterialCommunityIcons name="clipboard-check" size={24} color="#000000" />
              <Text style={styles.submitButtonText}>Create Authority</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  form: {
    padding: 20,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#333333',
  },
  inputError: {
    borderColor: '#FF4444',
  },
  dropdown: {
    backgroundColor: '#2A2A2A',
    borderColor: '#333333',
    borderRadius: 8,
  },
  dropdownContainer: {
    backgroundColor: '#2A2A2A',
    borderColor: '#333333',
  },
  dropdownText: {
    color: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfWidth: {
    width: '48%',
  },
  errorText: {
    color: '#FF4444',
    fontSize: 12,
    marginTop: 4,
  },
  expirationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expirationButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 15,
    borderWidth: 1,
    borderColor: '#333333',
  },
  expirationText: {
    color: '#FFFFFF',
    marginLeft: 10,
    fontSize: 16,
  },
  clearButton: {
    marginLeft: 10,
    padding: 10,
  },
  expirationInput: {
    marginTop: 8,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#333333',
  },
  exampleContainer: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FFD100',
  },
  exampleTitle: {
    color: '#FFD100',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  exampleText: {
    color: '#CCCCCC',
    fontSize: 14,
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: '#FFD100',
    borderRadius: 8,
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#666666',
  },
  submitButtonText: {
    color: '#000000',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
});

export default AuthorityFormScreen;
