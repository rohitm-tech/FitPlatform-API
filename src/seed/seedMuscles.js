import { Muscle } from '../models/muscleModel.js';

// key/meshNames intentionally match frontend/src/3d/muscleMeshRegistry.ts 1:1 —
// that file is the single mapping layer between these keys and the 3D rig's
// mesh names, ported from GymBuddy's placeholder-rig design.
const MUSCLES = [
  { key: 'upper-chest', displayName: 'Upper Chest', group: 'chest', meshNames: ['chest_upper_L', 'chest_upper_R'], description: 'Clavicular head of pectoralis major.' },
  { key: 'middle-chest', displayName: 'Middle Chest', group: 'chest', meshNames: ['chest_mid_L', 'chest_mid_R'], description: 'Sternocostal head of pectoralis major.' },
  { key: 'lower-chest', displayName: 'Lower Chest', group: 'chest', meshNames: ['chest_lower_L', 'chest_lower_R'], description: 'Abdominal part of pectoralis major.' },
  { key: 'inner-chest', displayName: 'Inner Chest', group: 'chest', meshNames: ['chest_inner_L', 'chest_inner_R'], description: 'Pectoralis minor and the sternal inner fibers.' },
  { key: 'upper-back', displayName: 'Upper Back', group: 'back', meshNames: ['back_upper_L', 'back_upper_R'], description: 'Infraspinatus, teres major/minor.' },
  { key: 'lats', displayName: 'Lats', group: 'back', meshNames: ['lat_L', 'lat_R'], description: 'Latissimus dorsi.' },
  { key: 'traps', displayName: 'Traps', group: 'back', meshNames: ['trap_L', 'trap_R'], description: 'Trapezius.' },
  { key: 'rhomboids', displayName: 'Rhomboids', group: 'back', meshNames: ['rhomboid_L', 'rhomboid_R'], description: 'Rhomboid major/minor.' },
  { key: 'front-delts', displayName: 'Front Delts', group: 'shoulders', meshNames: ['delt_front_L', 'delt_front_R'], description: 'Clavicular (anterior) deltoid.' },
  { key: 'side-delts', displayName: 'Side Delts', group: 'shoulders', meshNames: ['delt_side_L', 'delt_side_R'], description: 'Acromial (lateral) deltoid.' },
  { key: 'rear-delts', displayName: 'Rear Delts', group: 'shoulders', meshNames: ['delt_rear_L', 'delt_rear_R'], description: 'Spinal (posterior) deltoid.' },
  { key: 'biceps', displayName: 'Biceps', group: 'arms', meshNames: ['bicep_L', 'bicep_R'], description: 'Biceps brachii.' },
  { key: 'triceps', displayName: 'Triceps', group: 'arms', meshNames: ['tricep_L', 'tricep_R'], description: 'Triceps brachii.' },
  { key: 'forearms', displayName: 'Forearms', group: 'arms', meshNames: ['forearm_L', 'forearm_R'], description: 'Wrist flexors/extensors and brachioradialis.' },
  { key: 'quadriceps', displayName: 'Quadriceps', group: 'legs', meshNames: ['quad_L', 'quad_R'], description: 'Rectus femoris and vasti.' },
  { key: 'hamstrings', displayName: 'Hamstrings', group: 'legs', meshNames: ['hamstring_L', 'hamstring_R'], description: 'Biceps femoris, semitendinosus, semimembranosus.' },
  { key: 'glutes', displayName: 'Glutes', group: 'legs', meshNames: ['glute_L', 'glute_R'], description: 'Gluteus maximus, medius, minimus.' },
  { key: 'calves', displayName: 'Calves', group: 'legs', meshNames: ['calf_L', 'calf_R'], description: 'Gastrocnemius and soleus.' },
  { key: 'upper-abs', displayName: 'Upper Abs', group: 'core', meshNames: ['abs_upper'], description: 'Upper rectus abdominis.' },
  { key: 'lower-abs', displayName: 'Lower Abs', group: 'core', meshNames: ['abs_lower'], description: 'Lower rectus abdominis.' },
  { key: 'obliques', displayName: 'Obliques', group: 'core', meshNames: ['oblique_L', 'oblique_R'], description: 'External/internal obliques.' },
];

export const seedMuscles = async () => {
  const byKey = {};
  for (const data of MUSCLES) {
    const muscle = await Muscle.findOneAndUpdate({ key: data.key }, data, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
    byKey[data.key] = muscle;
  }
  console.log(`  ✓ Seeded ${MUSCLES.length} muscles`);
  return byKey;
};
