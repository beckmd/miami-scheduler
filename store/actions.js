import axios from 'axios';

export default {
  async fetchTerms() {
    const { data } = await axios.get('/api/terms');
    return {
      terms: data.terms,
      selectedTerm: data.terms[0].code
    };
  },
  selectTerm(termId) {
    return {
      selectedTerm: termId,
      selectedCourses: [],
      generatedSchedules: []
    };
  },
  async searchCourses(term, query) {
    if (!query) {
      return {
        searchedCourses: []
      };
    }
    const { data } = await axios.get(`/api/search?term=${term}&query=${query}`);
    return function({ coursesByCode }) {
      return {
        searchedCourses: data.courses,
        coursesByCode: data.courses.reduce((acc, course) => {
          return { ...acc, [course.code]: course };
        }, coursesByCode)
      };
    };
  },
  async fetchSections(code) {
    const { data } = await axios.get(`/api/courses/${code}`);
    return function({
      coursesByCode,
      sectionsByCrn,
      selectedCourses,
      loadingCourses
    }) {
      return {
        selectedCourses: [...selectedCourses, code],
        loadingCourses: loadingCourses.filter(c => c !== code),
        coursesByCode: {
          ...coursesByCode,
          [code]: data.course
        },
        sectionsByCrn: data.course.sections.reduce((acc, section) => {
          return { ...acc, [section.crn]: section };
        }, sectionsByCrn)
      };
    };
  },
  selectCourse(course) {
    return function({ loadingCourses, selectedCourses }) {
      if (
        loadingCourses.includes(course.code) ||
        selectedCourses.includes(course.code)
      ) {
        return {};
      } else {
        return {
          loadingCourses: [...loadingCourses, course.code]
        };
      }
    };
  },
  deselectCourse(code) {
    return function({ selectedCourses }) {
      if (selectedCourses.includes(code)) {
        return {
          selectedCourses: selectedCourses.filter(c => c !== code)
        };
      } else {
        return { selectedCourses };
      }
    };
  },
  generateSchedules() {
    return function({ coursesByCode, selectedCourses }) {
      if (selectedCourses.length) {
        const courses = selectedCourses
          .map(code => coursesByCode[code])
          .filter(course => {
            if (!course.sections) {
              console.log('MESSED UP', course.code);
            }
            return course.sections;
          });
        return {
          generatedSchedules: generateSchedules(courses)
        };
      } else {
        return {
          generatedSchedules: []
        };
      }
    };
  },
  prevSchedule() {
    return function({ generatedSchedules, currentSchedule }) {
      return {
        currentSchedule: Math.max(currentSchedule - 1, 0)
      };
    };
  },
  nextSchedule() {
    return function({ generatedSchedules, currentSchedule }) {
      return {
        currentSchedule: Math.min(
          currentSchedule + 1,
          generatedSchedules.length - 1
        )
      };
    };
  }
};

function generateSchedules(
  courses,
  schedules = [],
  currentSchedule = [],
  currentValidator = {}
) {
  const course = courses[0];
  for (let section of course.sections) {
    const validator = { ...currentValidator };
    if (isConflictingSection(section, validator)) continue;

    const schedule = [
      ...currentSchedule,
      { code: course.code, crn: section.crn }
    ];

    if (courses.length > 1) {
      generateSchedules(courses.slice(1), schedules, schedule, validator);
    } else {
      schedules.push(schedule);
    }
  }
  return schedules;
}

function isConflictingSection(section, validator) {
  for (let meet of section.meets) {
    for (let day of meet.days) {
      for (let time = meet.start_time; time <= meet.end_time; time += 5) {
        if (validator[day + time]) {
          return true;
        }
        validator[day + time] = true;
      }
    }
  }
  return false;
}
