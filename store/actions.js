import axios from 'axios';

import { getSchedules } from './generator';

const schedulesPerPage = {
  detailed: 1,
  compact: 3
};

const filterDefauls = {
  class_time: {
    operator: 'start_after',
    time: '10:00 AM',
    days: ['M', 'W', 'F']
  },
  class_load: {
    operator: 'at_most',
    amount: 3,
    days: ['M', 'W', 'F']
  },
  break_time: {
    from: '11:00 AM',
    until: '12:00 PM',
    days: ['M', 'W', 'F']
  }
};

function toMinutes(time) {
  const [h, m, p] = time
    .toUpperCase()
    .replace(' ', ':')
    .split(':');
  return (parseInt(h) % 12) * 60 + parseInt(m) + (p === 'PM' ? 12 * 60 : 0);
}

const filterFunctions = {
  class_time({ start_times, end_times }, filter) {
    const time = toMinutes(filter.time);
    for (let day of filter.days) {
      switch (filter.operator) {
        case 'start_before':
          if (start_times[day] >= time && start_times[day] != 1440)
            return false;
          else break;
        case 'start_at':
          if (start_times[day] != time && start_times[day] != 1440)
            return false;
          else break;
        case 'start_after':
          if (start_times[day] <= time && start_times[day] != 1440)
            return false;
          else break;
        case 'end_before':
          if (end_times[day] >= time && end_times[day] != 0) return false;
          else break;
        case 'end_at':
          if (end_times[day] != time && end_times[day] != 0) return false;
          else break;
        case 'end_after':
          if (end_times[day] <= time && end_times[day] != 0) return false;
          else break;
      }
    }
    return true;
  },
  class_load({ class_loads }, filter) {
    for (let day of filter.days) {
      switch (filter.operator) {
        case 'less_than':
          if (class_loads[day] >= filter.amount) return false;
          else break;
        case 'at_most':
          if (class_loads[day] > filter.amount) return false;
          else break;
        case 'exactly':
          if (class_loads[day] != filter.amount) return false;
          else break;
        case 'at_least':
          if (class_loads[day] < filter.amount) return false;
          else break;
        case 'more_than':
          if (class_loads[day] <= filter.amount) return false;
          else break;
      }
    }
    return true;
  },
  break_time({ class_times }, filter) {
    const from = toMinutes(filter.from);
    const until = toMinutes(filter.until);
    for (let day of filter.days) {
      for (let { start, end } of class_times[day]) {
        if (Math.max(from, start) < Math.min(until, end)) return false;
      }
    }
    return true;
  }
};

export function fetchTerms(getState, setState) {
  return async function() {
    const { data } = await axios.get('/api/terms');
    setState({
      terms: data.terms,
      selectedTerm: data.terms[0].code
    });
  };
}

export function selectTerm(getState, setState) {
  return function(termId) {
    setState({
      selectedTerm: termId,
      selectedCourses: [],
      generatedSchedules: []
    });
  };
}

export function searchCourses(getState, setState) {
  return async function(term, query) {
    if (!query) {
      setState({
        searchedCourses: []
      });
    } else {
      const { data } = await axios.get(
        `/api/search?term=${term}&query=${query}`
      );
      setState(({ coursesByCode }) => {
        return {
          searchedCourses: data.courses,
          coursesByCode: data.courses.reduce((acc, course) => {
            return { ...acc, [course.code]: course };
          }, coursesByCode)
        };
      });
    }
  };
}

export function selectCourse(getState, setState, getActions) {
  return function(code) {
    const { loadingCourses, selectedCourses } = getState();
    if (loadingCourses.concat(selectedCourses).includes(code)) {
      return;
    }

    setState(state => {
      return {
        loadingCourses: state.loadingCourses.concat(code)
      };
    });

    const { fetchCourse } = getActions();
    fetchCourse(code);
  };
}

export function fetchCourse(getState, setState, getActions) {
  return async function(code) {
    const { data } = await axios.get(`/api/courses/${code}`);
    await setState(state => {
      return {
        selectedCourses: state.selectedCourses.concat(code),
        loadingCourses: state.loadingCourses.filter(c => c !== code),
        coursesByCode: {
          ...state.coursesByCode,
          [code]: data.course
        },
        sectionsByCrn: data.course.sections.reduce((acc, section) => {
          return { ...acc, [section.crn]: section };
        }, state.sectionsByCrn)
      };
    });

    const { generateSchedules } = getActions();
    generateSchedules();
  };
}

export function deselectCourse(getState, setState, getActions) {
  return async function(code) {
    await setState(({ selectedCourses }) => {
      if (selectedCourses.includes(code)) {
        return {
          selectedCourses: selectedCourses.filter(c => c !== code),
          currentSchedule: 0
        };
      } else {
        return { selectedCourses };
      }
    });

    const { generateSchedules } = getActions();
    generateSchedules();
  };
}

export function generateSchedules(getState, setState, getActions) {
  return async function() {
    const { selectedCourses } = getState();
    setState({
      generatingSchedules: selectedCourses.join(''),
      generationStatus: 0
    });
    await getSchedules(getState, setState);

    const { applyFilters } = getActions();
    applyFilters();
  };
}

export function createFilter(getState, setState) {
  return function(type) {
    setState(({ scheduleFilters }) => {
      const id = Math.max(0, ...scheduleFilters.map(filter => filter.id)) + 1;
      return {
        scheduleFilters: [
          ...scheduleFilters,
          { id, type, ...filterDefauls[type] }
        ],
        filtersChanged: true
      };
    });
  };
}

export function updateFilter(getState, setState) {
  return function(id, update) {
    setState(({ scheduleFilters }) => {
      return {
        scheduleFilters: scheduleFilters.map(
          filter => (filter.id === id ? { ...filter, ...update } : filter)
        ),
        filtersChanged: true
      };
    });
  };
}

export function deleteFilter(getState, setState) {
  return async function(id) {
    await setState(({ scheduleFilters }) => {
      return {
        scheduleFilters: scheduleFilters.filter(filter => filter.id !== id),
        filtersChanged: true
      };
    });
  };
}

export function applyFilters(getState, setState) {
  return function() {
    setState(({ generatedSchedules, scheduleFilters }) => {
      return {
        filteredSchedules: generatedSchedules.filter(schedule =>
          scheduleFilters.every(filter =>
            filterFunctions[filter.type](schedule, filter)
          )
        ),
        filtersChanged: false,
        currentSchedule: 0
      };
    });
  };
}

export function selectScheduleView(getState, setState) {
  return function(view) {
    setState(({ scheduleView }) => {
      if (scheduleView !== view) {
        return {
          scheduleView: view,
          currentSchedule: 0
        };
      } else {
        return {};
      }
    });
  };
}

export function selectScheduleSort(getState, setState) {
  return function(sort) {
    setState(({ scheduleSort }) => {
      if (scheduleSort !== sort) {
        return {
          scheduleSort: sort
        };
      } else {
        return {};
      }
    });
  };
}

export function prevSchedule(getState, setState) {
  return function() {
    setState(({ currentSchedule }) => {
      return {
        currentSchedule: Math.max(currentSchedule - 1, 0)
      };
    });
  };
}

export function nextSchedule(getState, setState) {
  return function() {
    setState(({ currentSchedule, generatedSchedules, scheduleView }) => {
      return {
        currentSchedule: Math.min(
          currentSchedule + 1,
          Math.ceil(
            generatedSchedules.length / schedulesPerPage[scheduleView]
          ) - 1
        )
      };
    });
  };
}
